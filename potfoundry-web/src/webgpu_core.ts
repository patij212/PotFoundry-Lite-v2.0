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

import potPreviewWgsl from './assets/pot_preview.wgsl?raw';
import {
  buildCameraBasis,
  normalizeCameraBasis as cbNormalizeCameraBasis,
  applyCameraEulerToBasis,
  rotateCameraBasisForState,
  syncAnglesFromBasis as cbSyncAnglesFromBasis,
  rotateVectorAroundAxis as cbRotateVectorAroundAxis,
  arcballDelta as sharedArcballDelta,
  cameraAxisToWorld as cbCameraAxisToWorld,
  rotateBasisAboutAxisFull,
  turntableStep,
  PITCH_SOFT_LIMIT,
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
  WORLD_UP,
} from './camera_basis';
import { cameraPayloadDiffers as sharedCameraPayloadDiffers } from './camera_basis';
import { worldRayFromCanvas, intersectRayZPlane, intersectRayCylinder } from './camera_helpers';
import { CameraController, PointerState, ControllerHelpers } from './camera_controller';
import * as CameraConstants from './camera_constants';
import type { MountOptions, WebGPUController, WebGPUEvent, WebGPUState, WebGPUParams, CameraRig, Ray, CameraMode } from './types';
export type { WebGPUController, WebGPUEvent } from './types';
import { DEBUG_PARAM_FLAG, ALWAYS_ON_DIAGNOSTICS, isCameraMode, lerp, easeOutCubic, clamp, computeSceneExtents } from './types';
import manager from './infra/logging/MessageManager';
import { installConsolePatch } from './infra/logging/ConsolePatch';
import { resolveLoggingPreferences } from './infra/logging/loggingPreferences';
import { installWebGpuCapture, withValidationScope, createShaderModule } from './infra/logging/WebGpuCapture';

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
  const root = window as any;
  root.__pf_manager = root.__pf_manager ?? manager;
} catch (err) {
  /* ignore attach errors */
}

// Canonical constants moved to `camera_constants.ts`.
// Ensure the imported WGSL is handled robustly and not coerced from an object.
let WGSL_SOURCE: string = '';
if (typeof potPreviewWgsl === 'string') {
  WGSL_SOURCE = potPreviewWgsl;
} else if (potPreviewWgsl && typeof (potPreviewWgsl as any).default === 'string') {
  WGSL_SOURCE = (potPreviewWgsl as any).default;
} else {
  console.warn('[WebGPU] potPreviewWgsl is not a string; import:', potPreviewWgsl);
  WGSL_SOURCE = '';
}
const MAX_VERTS = 0xffffffff;
const STYLE_PARAM_CAPACITY = 48;
const {
  DEFAULT_INTERACTIVE_LOD,
  MIN_INTERACTIVE_LOD,
  INTERACTIVE_THETA_RATIO_FLOOR,
  INTERACTIVE_Z_RATIO_FLOOR,
  MIN_THETA_STATIC,
  MIN_Z_STATIC,
  MIN_THETA_INTERACTIVE,
  MIN_Z_INTERACTIVE,
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
  BELL_WIDTH_OFFSET,
  DRAIN_RADIUS_OFFSET,
  INVALID_STATUS_COOLDOWN_MS,
  DEFAULT_CLEAR_COLOR,
  // Professional camera constants
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_SENSITIVITY,
  PAN_SENSITIVITY,
  PAN_INERTIA_DECAY,
  ROTATION_INERTIA_DECAY,
  ROTATION_INERTIA_MIN,
  AUTOROTATE_SPEED_DEFAULT,
  AUTOROTATE_RESUME_DELAY_MS,
  FOCUS_TWEEN_DURATION_MS,
  FOCUS_ZOOM_FACTOR,
  FREE_MOVE_SPEED_BASE,
  FREE_MOVE_SPEED_BOOST,
  PIVOT_LERP_SPEED,
  PIVOT_SNAP_THRESHOLD,
} = CameraConstants as any;


type CameraSnapshot = any;
type CameraBasis = import('./camera_basis').CameraBasis;
type Mat4 = Float32Array;

// Minimal local types to satisfy TypeScript; the concrete types are defined elsewhere or are runtime shaped.
type WebGPUEmitter = (ev: WebGPUEvent | any) => void;
// WebGPUEvent re-exported from types_shims
type GradientColor = [number, number, number];
type ClearColor = [number, number, number, number];
// CameraMode is imported from './types'
// `Mat4` already defined above; Ray used as simple type alias
// Ray type defined later as { origin: Vec3; dir: Vec3 }
type Vec3 = HelperVec3;
type Quaternion = HelperQuaternion;
let lastLookAtBasis: { xLen: number; yLen: number; zLen: number } | null = null;
let lastCameraRig: CameraRig | null = null;

type UniformParityState = WebGPUState & { __pendingUniformParityRewrite?: boolean };

const markUniformParityRewriteNeeded = (state: WebGPUState): void => {
  const target = state as UniformParityState;
  target.__pendingUniformParityRewrite = true;
  state.cameraDirty = true;
};

const isUniformParityRewritePending = (state: WebGPUState): boolean => {
  return Boolean((state as UniformParityState).__pendingUniformParityRewrite);
};

const clearUniformParityRewriteFlag = (state: WebGPUState): void => {
  const target = state as UniformParityState;
  if (target.__pendingUniformParityRewrite) {
    target.__pendingUniformParityRewrite = false;
  }
};

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

function cancelFocusTween(): void {
  cameraController?.cancelFocusTween?.();
}

function markInteraction(shouldCancel = true): void {
  cameraController?.markInteraction?.(shouldCancel);
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
    console.log('[WebGPU] commitDisplayBasisToState invoked');
  } catch (err) {
    console.warn('WebGPU emit error', err);
    return;
  }
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
    const val = incoming[key];
    if (val !== undefined) {
      target[key] = val;
    }
  }
  return target;
};

const clampUnit = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  if (parsed >= 1) {
    return 1;
  }
  return parsed;
};

const clampZoomValue = (v: number): number => {
  if (!Number.isFinite(v)) return 1.0;
  const minZoom = 0.25;
  const maxZoom = 4.0;
  return Math.max(minZoom, Math.min(maxZoom, v));
};

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

const wrapAngle = (v: number): number => {
  while (v > Math.PI) v -= 2 * Math.PI;
  while (v <= -Math.PI) v += 2 * Math.PI;
  return v;
};

const wrapTau = (v: number): number => {
  const twoPi = 2 * Math.PI;
  let r = v % twoPi;
  if (r > Math.PI) r -= twoPi;
  if (r <= -Math.PI) r += twoPi;
  return r;
};

const parseClearColor = (source: unknown): ClearColor => {
  if (Array.isArray(source) && source.length >= 4) {
    return [
      clampUnit(source[0]),
      clampUnit(source[1]),
      clampUnit(source[2]),
      clampUnit(source[3]),
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
  if (!Number.isFinite(parsed) || parsed < minimum) {
    return minimum;
  }
  return parsed;
};

const createPipeline = async (
  device: GPUDevice,
  format: GPUTextureFormat,
  shaderModule: GPUShaderModule,
  reportStatus: (msg: string) => void,
  reportDiagnostic: (message: string, detail?: Record<string, unknown>) => void,
  shaderCodeSnippet?: string | null
): Promise<GPURenderPipeline | null> => {
  // Use a loose cast to avoid cross-definition incompatibilities in
  // the local GPUCompilationInfo vs ambient types (some environments
  // expose a readonly messages array). The runtime call is unchanged.
  const info = await ((shaderModule as any).getCompilationInfo?.() ?? Promise.resolve(undefined));
  if (info && Array.isArray(info.messages) && info.messages.some((m: any) => m.type === 'error')) {
    for (const message of info.messages) {
      console.warn('WGSL', message);
    }
    reportDiagnostic('webgpu:shader-compile-error', { messages: info.messages });
    reportStatus('WebGPU • shader compile failed (see console)');
    return null;
  }
  const pipelineDescriptorSummary = (depthFmt: string) => ({
    layout: 'auto',
    vertexEntry: 'vs_main',
    fragmentEntry: 'fs_main',
    targets: [{ format }],
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: depthFmt },
  });

  try {
    const pipelineLabel = 'component:pipeline-main';
    const pipe = await withValidationScope(device as any, pipelineLabel, () =>
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
    if (!pipe) {
      throw new Error('createRenderPipelineAsync returned undefined');
    }
    // pipeline succeeded with the default depth format
    depthFormatUsed = 'depth24plus';
    return pipe;
  } catch (err) {
    console.error('createRenderPipelineAsync failed', err);
    // Emit the raw error for diagnostics and attempt a robust fallback.
    reportDiagnostic('webgpu:pipeline-create-error', {
      error: err instanceof Error ? err.message : String(err),
      shaderCodeSnippet: shaderCodeSnippet ? shaderCodeSnippet.slice(0, 1024) : null,
      compilationMessages: info?.messages ?? null,
      pipelineDescriptor: pipelineDescriptorSummary('depth24plus'),
      deviceLimits: (device as any)?.limits ?? null,
      deviceFeatures: Array.from(((device as any)?.features as Iterable<string>) ?? []),
    });
    // Try fallback: explicitly create a bind group layout + pipeline layout that matches
    // the shader's expected group 0: four small uniform buffers and one read-only storage.
    try {
      const bgl = device.createBindGroupLayout({
        label: 'component:bgl-default',
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 3, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 4, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
        ],
      });
      const layout = device.createPipelineLayout({ label: 'component:pipeline-layout-default', bindGroupLayouts: [bgl] });
      const fallbackLabel = 'component:pipeline-fallback-depth24';
      const fallback = await withValidationScope(device as any, fallbackLabel, () =>
        device.createRenderPipelineAsync({
          label: fallbackLabel,
          layout,
          vertex: { module: shaderModule, entryPoint: 'vs_main' },
          fragment: {
            module: shaderModule,
            entryPoint: 'fs_main',
            targets: [{ format, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }],
          },
          primitive: { topology: 'triangle-list', cullMode: 'none' },
          depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
        })
      );
      if (!fallback) {
        throw new Error('fallback pipeline creation returned undefined');
      }
      depthFormatUsed = 'depth24plus';
      reportDiagnostic('webgpu:pipeline-create-fallback', { message: 'createRenderPipelineAsync succeeded with explicit layout' });
      return fallback;
    } catch (err2) {
      console.error('createRenderPipelineAsync explicit-layout fallback failed', err2);
      // If the failure mentions depth24plus, try a second fallback using depth32float
      const errMsg = err2 instanceof Error ? err2.message : String(err2);
      if (errMsg.toLowerCase().includes('depth24plus') || errMsg.toLowerCase().includes('depth_write')) {
        try {
          const bgl3 = device.createBindGroupLayout({
            label: 'component:bgl-depth24plus-stencil8',
            entries: [
              { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
              { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
              { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
              { binding: 3, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
              { binding: 4, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
            ],
          });
          const layout3 = device.createPipelineLayout({ label: 'component:pipeline-layout-depth24plus-stencil8', bindGroupLayouts: [bgl3] });
          const fallbackLabel3 = 'component:pipeline-depth24plus-stencil8';
          const fallback3 = await withValidationScope(device as any, fallbackLabel3, () =>
            device.createRenderPipelineAsync({
              label: fallbackLabel3,
              layout: layout3,
              vertex: { module: shaderModule, entryPoint: 'vs_main' },
              fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{ format, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }],
              },
              primitive: { topology: 'triangle-list', cullMode: 'none' },
              depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus-stencil8' },
            })
          );
          if (!fallback3) {
            throw new Error('depth24plus-stencil8 fallback returned undefined');
          }
          depthFormatUsed = 'depth24plus-stencil8' as unknown as GPUTextureFormat;
          reportDiagnostic('webgpu:pipeline-create-fallback', { message: 'createRenderPipelineAsync succeeded with explicit layout + depth24plus-stencil8' });
          return fallback3;
        } catch (err4) {
          console.error('createRenderPipelineAsync depth24plus-stencil8 fallback failed', err4);
        }
        try {
          const bgl2 = device.createBindGroupLayout({
            label: 'component:bgl-depth32float',
            entries: [
              { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
              { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
              { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
              { binding: 3, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
              { binding: 4, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
            ],
          });
          const layout2 = device.createPipelineLayout({ label: 'component:pipeline-layout-depth32float', bindGroupLayouts: [bgl2] });
          const fallbackLabel2 = 'component:pipeline-depth32float';
          const fallback2 = await withValidationScope(device as any, fallbackLabel2, () =>
            device.createRenderPipelineAsync({
              label: fallbackLabel2,
              layout: layout2,
              vertex: { module: shaderModule, entryPoint: 'vs_main' },
              fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{ format, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }],
              },
              primitive: { topology: 'triangle-list', cullMode: 'none' },
              depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth32float' },
            })
          );
          if (!fallback2) {
            throw new Error('depth32float fallback returned undefined');
          }
          depthFormatUsed = 'depth32float';
          reportDiagnostic('webgpu:pipeline-create-fallback', { message: 'createRenderPipelineAsync succeeded with explicit layout + depth32float' });
          return fallback2;
        } catch (err3) {
          console.error('createRenderPipelineAsync depth32float fallback failed', err3);
        }
      }
      // Try a minimal pipeline without depth or blending to check for hardware/driver limitations.
      const minimal = await attemptMinimalPipeline(device, format, shaderModule, reportDiagnostic);
      if (minimal) {
        depthFormatUsed = null;
        return minimal;
      }
      // If all fallbacks fail, try a minimal shader module to determine
      // whether the failure is shader-specific or platform/driver-specific.
      try {
        const minimalWgsl = `
          @vertex
          fn vs_main(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4<f32> {
            var pos = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
            return vec4<f32>(pos[vid], 0.0, 1.0);
          }
          @fragment
          fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(1.0, 0.0, 0.0, 1.0); }
        `;
        const testModule = await createShaderModule(device as any, minimalWgsl, 'minimal-test');
        const testInfo = await ((testModule as any).getCompilationInfo?.() ?? Promise.resolve(undefined));
        if (testInfo && Array.isArray(testInfo.messages) && testInfo.messages.some((m: any) => m.type === 'error')) {
          reportDiagnostic('webgpu:pipeline-failed', { message: 'Minimal shader test failed compile', messages: testInfo.messages });
        } else {
          try {
            const testPipe = await device.createRenderPipelineAsync({
              layout: 'auto',
              vertex: { module: testModule, entryPoint: 'vs_main' },
              fragment: { module: testModule, entryPoint: 'fs_main', targets: [{ format }] },
              primitive: { topology: 'triangle-list', cullMode: 'none' },
            });
            reportDiagnostic('webgpu:pipeline-failed', { message: 'Minimal shader pipeline succeeded; shader is likely the issue' });
            try { testPipe; } catch (e) { /* no-op: just confirmation */ }
          } catch (testErr) {
            reportDiagnostic('webgpu:pipeline-failed', { message: 'Minimal shader pipeline failed; likely platform/driver issue', error: testErr instanceof Error ? testErr.message : String(testErr) });
          }
        }
      } catch (testErr) {
        reportDiagnostic('webgpu:pipeline-failed', { message: 'Minimal shader module creation check failed', error: testErr instanceof Error ? testErr.message : String(testErr) });
      }
      reportStatus('WebGPU • pipeline creation failed');
      reportDiagnostic('webgpu:pipeline-failed', {
        error: err2 instanceof Error ? err2.message : String(err2),
      });
      return null;
    }
  }
};
// Attempt a minimal pipeline without depth/stencil or blending as a final fallback
const attemptMinimalPipeline = async (
  device: GPUDevice,
  format: GPUTextureFormat,
  shaderModule: GPUShaderModule,
  reportDiagnostic: (message: string, detail?: Record<string, unknown>) => void
): Promise<GPURenderPipeline | null> => {
  try {
    const minimalLabel = 'component:pipeline-minimal';
    const pipe = await withValidationScope(device as any, minimalLabel, () =>
      device.createRenderPipelineAsync({
        label: minimalLabel,
        layout: 'auto',
        vertex: { module: shaderModule, entryPoint: 'vs_main' },
        fragment: { module: shaderModule, entryPoint: 'fs_main', targets: [{ format }] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
      })
    );
    if (!pipe) {
      throw new Error('minimal pipeline creation returned undefined');
    }
    reportDiagnostic('webgpu:pipeline-create-fallback', { message: 'createRenderPipelineAsync succeeded with minimal pipeline (no depth, no blend)' });
    return pipe;
  } catch (err) {
    try {
      // Try explicit layout with minimal features
      const bgl = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 3, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 4, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
        ],
      });
      const layout = device.createPipelineLayout({ bindGroupLayouts: [bgl] });
      const pipe2 = await device.createRenderPipelineAsync({
        layout,
        vertex: { module: shaderModule, entryPoint: 'vs_main' },
        fragment: { module: shaderModule, entryPoint: 'fs_main', targets: [{ format }] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
      });
      reportDiagnostic('webgpu:pipeline-create-fallback', { message: 'createRenderPipelineAsync succeeded with explicit layout minimal pipeline' });
      return pipe2;
    } catch (err2) {
      reportDiagnostic('webgpu:pipeline-create-fallback', { message: 'createRenderPipelineAsync minimal fallbacks failed', error: err2 instanceof Error ? err2.message : String(err2) });
      return null;
    }
  }
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

const buildUniformBlock = (size: number): Float32Array => {
  const buffer = new ArrayBuffer(size);
  const f32 = new Float32Array(buffer);
  f32.fill(0); // Initialize the array with zeros
  return f32;
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

const vec3Length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const vec3Normalize = (v: Vec3): Vec3 => {
  const len = vec3Length(v);
  if (!Number.isFinite(len) || len < 1e-8) {
    return [0, 0, 0];
  }
  return [v[0] / len, v[1] / len, v[2] / len];
};
const vec3Subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vec3Add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vec3Scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
const vec3Cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const vec3Dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const rotateVectorAroundAxis = cbRotateVectorAroundAxis;

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

const syncAnglesFromBasis = (state: WebGPUState): void => {
  const { rotX, rotY } = cbSyncAnglesFromBasis({ forward: [...(state.camForward as Vec3)] as Vec3, up: [...(state.camUp as Vec3)] as Vec3, right: [...(state.camRight as Vec3)] as Vec3 });
  const prevY = Number.isFinite(state.rotY) ? state.rotY : 0;
  let delta = rotY - prevY;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  state.rotX = wrapAngle(rotX);
  state.rotY = wrapAngle(prevY + delta);
};

const rotateCameraBasis = (state: WebGPUState, axis: Vec3, angle: number): void => {
  rotateCameraBasisForState(state, axis, angle);
  syncAnglesFromBasis(state);
};

// rotateBasisInPlace is imported from shared helpers and used directly.

const normalizeCameraBasis = cbNormalizeCameraBasis;

// Forward declaration for commitDisplayBasisToState.
// This function is defined inside `mount` to access the camera controller,
// but is used in module-level functions like applyViewPreset.
let commitDisplayBasisToState: (state: WebGPUState) => boolean = (_state: WebGPUState) => false;

// Forward declaration for emitDiagnostic (defined inside mount).
let emitDiagnostic: (message: string, detail?: Record<string, unknown>) => void = () => { };

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

// Project a world-space position (x,y,z) using a viewProjection matrix
// and return clip coords {x,y,w}
const mulMat4Vec4 = (m: Mat4, x: number, y: number, z: number) => {
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  return { x: cx, y: cy, w: cw };
};

const ndcDirBetween = (projA: { x: number; y: number; w: number }, projB: { x: number; y: number; w: number }) => {
  const ax = projA.x / projA.w;
  const ay = projA.y / projA.w;
  const bx = projB.x / projB.w;
  const by = projB.y / projB.w;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  return len < 1e-9 ? [0, 0] : [dx / len, dy / len];
};

const ndcDeltaBetween = (projA: { x: number; y: number; w: number }, projB: { x: number; y: number; w: number }) => {
  const ax = projA.x / projA.w;
  const ay = projA.y / projA.w;
  const bx = projB.x / projB.w;
  const by = projB.y / projB.w;
  return [bx - ax, by - ay];
};

// Compute overlay (screen) direction for a world `axis` using the camera
// rig. Projects the axis vector directly to screen space so the overlay
// direction matches a naive projection computed elsewhere (parity tests).
const overlayForAxisFromBasis = (
  rig: CameraRig,
  _basis: CameraBasis,
  axis: Vec3,
  pivot: Vec3,
  worldScale: number
): [number, number] => {
  const axisLen = vec3Length(axis);
  const scaledAxis =
    axisLen > 1e-9 ? (vec3Scale(axis, worldScale / axisLen) as Vec3) : ([0, 0, 0] as Vec3);
  const p = mulMat4Vec4(rig.viewProjection, pivot[0], pivot[1], pivot[2]);
  const pa = mulMat4Vec4(
    rig.viewProjection,
    pivot[0] + scaledAxis[0],
    pivot[1] + scaledAxis[1],
    pivot[2] + scaledAxis[2]
  );
  const delta = ndcDeltaBetween(p, pa);
  // Convert NDC deltas to overlay coords (flip Y)
  const ovx = delta[0];
  const ovy = -delta[1];
  const len = Math.hypot(ovx, ovy);
  if (len < 1e-9) return [0, 0];
  return [ovx / len, ovy / len];
};

const matrixIsFinite = (m: Mat4): boolean => {
  for (let i = 0; i < 16; i += 1) {
    if (!Number.isFinite(m[i])) {
      return false;
    }
  }
  return true;
};

const mat4LookAtLH = (eye: Vec3, target: Vec3, up: Vec3): Mat4 => {
  // Compute forward vector (zAxis). If the camera looks exactly along the
  // up vector, the cross product will be zero length and produce NaNs.
  // Defend by choosing a fallback up vector when collinear.
  const zAxis = vec3Normalize(vec3Subtract(target, eye));
  let upVec: Vec3 = up;
  let dotUp = Math.abs(vec3Dot(zAxis, upVec));
  if (dotUp > 0.9999) {
    // Prefer world up when possible so the view basis stays aligned with the
    // Z-up scene; if that is also collinear, fall back to a horizontal axis.
    upVec = WORLD_UP;
    dotUp = Math.abs(vec3Dot(zAxis, upVec));
  }
  if (dotUp > 0.9999) {
    upVec = Math.abs(zAxis[2]) < 0.9 ? WORLD_UP : [1, 0, 0];
  }
  let xAxis = vec3Cross(upVec, zAxis);
  // If cross produced a near-zero vector, fall back to a stable axis.
  const xLen = vec3Length(xAxis);
  if (!Number.isFinite(xLen) || xLen < 1e-6) {
    xAxis = [1, 0, 0];
  } else {
    xAxis = vec3Scale(xAxis, 1 / xLen);
  }
  const yAxis = vec3Cross(zAxis, xAxis);
  // View matrix: camera axes form ROWS of rotation part (stored column-major).
  const out = new Float32Array(16);
  out[0] = xAxis[0];
  out[1] = yAxis[0];
  out[2] = zAxis[0];
  out[3] = 0;
  out[4] = xAxis[1];
  out[5] = yAxis[1];
  out[6] = zAxis[1];
  out[7] = 0;
  out[8] = xAxis[2];
  out[9] = yAxis[2];
  out[10] = zAxis[2];
  out[11] = 0;
  out[12] = -vec3Dot(xAxis, eye);
  out[13] = -vec3Dot(yAxis, eye);
  out[14] = -vec3Dot(zAxis, eye);
  out[15] = 1;
  return out;
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

// Ray type imported from './types' above, avoid re-declaration

// invertMat4 moved to shared helpers (camera_helpers.ts)

// world-ray and intersection helpers moved to `camera_helpers.ts` and imported.

const INTERACTION_TIMEOUT_MS = 240;
const INERTIA_DECAY = 0.92;
// Choose a tight threshold to avoid accidental 180° flips when committing transient
// camera basis into persistent state. The value mirrors the preview asset
// implementation and test expectations (-0.999) so flipping only occurs when
// the new right vector is nearly inverted relative to the previous right.
const BASIS_FLIP_DOT_THRESHOLD = CameraConstants.BASIS_FLIP_DOT_THRESHOLD; // dot threshold used when deciding whether to flip basis

// Backwards-compatible aliases used by static tests that inspect the
// codebase for the standard invert-orbit sign semantics.  These are
// simple helpers that map a boolean invert flag into +/-1 multipliers
// used when converting pointer drags to yaw/pitch deltas.
const invertOrbitX = true;
const invertOrbitY = false;
const invertOrbitXSign = invertOrbitX ? +1 : -1;
const invertOrbitYSign = invertOrbitY ? +1 : -1;
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

// `resetInertia` is delegated to CameraController; function wrapper
// defined later to avoid use-before-assignment.

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
    case 'front':
      applyCameraEuler(state, 0, 0);
      // Commit the transient display basis to ensure canonicalization
      if (typeof commitDisplayBasisToState === 'function') commitDisplayBasisToState(state);
      break;
    case 'right':
      applyCameraEuler(state, 0, -Math.PI / 2);
      if (typeof commitDisplayBasisToState === 'function') commitDisplayBasisToState(state);
      break;
    case 'iso':
      applyCameraEuler(state, 0.9, -Math.PI / 4);
      if (typeof commitDisplayBasisToState === 'function') commitDisplayBasisToState(state);
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
  state.displayCamRight = [...state.camRight];
  state.displayCamUp = [...state.camUp];
  state.displayCamForward = [...state.camForward];
  state.displayCamQuat = [...state.camQuat] as Quaternion;
  state.displayRotX = state.rotX;
  state.displayRotY = state.rotY;
  state.cameraDirty = true;
  // Immediately commit presets to canonicalized basis and parity-aligned state
  if (typeof commitDisplayBasisToState === 'function') {
    manager.info('applyViewPreset:commit', 'applyViewPreset: committing display basis at end');
    commitDisplayBasisToState(state);
  }
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
          console.log('[WebGPU] buildCameraRig parity_check', { preset: 'free', ov_basis_unit, ov_proj_unit, dotAlign });
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
  let projection: Mat4;
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
          console.log('[WebGPU] buildCameraRig parity_check (non-free)', { ov_basis_unit, ov_proj_unit, dotAlign });
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
  applyLoggingPreferences(initialParams as Record<string, unknown>);
  let statusReady = false;
  // Attach manager to window for debug/test introspection; harmless in production.
  try {
    (window as any).__pf_manager = manager;
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
    (window as any).__pf_webgpu_mounts = (window as any).__pf_webgpu_mounts || {};
    if (mountCanvasId) {
      (window as any).__pf_webgpu_mounts[mountCanvasId] = (window as any).__pf_webgpu_mounts[mountCanvasId] || {};
      (window as any).__pf_webgpu_mounts[mountCanvasId].debug = (window as any).__pf_webgpu_mounts[mountCanvasId].debug || {
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
      if (Object.keys(detail).length) {
        manager.debug('diag:' + message, message, detail);
      } else {
        manager.debug('diag:' + message, message);
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
  const setDebugOverlayMessage = (message: string, detail?: Record<string, unknown>) => {
    if (!debugOverlayEl) return;
    try {
      debugOverlayEl.style.display = 'block';
      const t = new Date().toISOString();
      debugOverlayEl.textContent = `${t} ${message}\n${detail ? JSON.stringify(detail, null, 2) : ''}`;
    } catch (e) {
      /* ignore DOM errors */
    }
  };

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
  };

  const navGpu = (navigator as Navigator & { gpu?: unknown }).gpu as
    | {
      requestAdapter: () => Promise<unknown>;
      getPreferredCanvasFormat: () => GPUTextureFormat;
    }
    | undefined;

  if (!navGpu) {
    emitDiagnostic('webgpu:unsupported', { ...baseDiagInfo });
    return fail('webgpu:not-supported', 'WebGPU not supported', undefined, baseDiagInfo);
  }

  const attemptAdapterRequest = async (
    options: GPURequestAdapterOptions | undefined,
    label: string
  ): Promise<GPUAdapter | null> => {
    try {
      const adapterResult = await (navGpu as any).requestAdapter(options);
      if (!adapterResult) {
        emitDiagnostic('webgpu:adapter-null', { ...baseDiagInfo, attempt: label });
      }
      return adapterResult as GPUAdapter | null;
    } catch (err) {
      emitDiagnostic('webgpu:adapter-request-error', {
        ...baseDiagInfo,
        attempt: label,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  };

  const adapter =
    (await attemptAdapterRequest(undefined, 'default')) ??
    (await attemptAdapterRequest({ powerPreference: 'high-performance' }, 'high-performance')) ??
    (await attemptAdapterRequest({ powerPreference: 'low-power' }, 'low-power')) ??
    (await attemptAdapterRequest({ forceFallbackAdapter: true }, 'fallback'));
  if (!adapter) {
    emitDiagnostic('webgpu:adapter-missing', { ...baseDiagInfo, canvasId: mountCanvasId });
    return fail('webgpu:adapter-unavailable', 'WebGPU adapter unavailable', undefined, {
      ...baseDiagInfo,
    });
  }
  emitDiagnostic('webgpu:adapter-ready');
  debugLog('adapter-ready');
  let device: GPUDevice;
  try {
    device = await (adapter as any).requestDevice();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitDiagnostic('webgpu:device-request-failed', { message, ...baseDiagInfo });
    return fail('webgpu:adapter-unavailable', 'WebGPU device request failed', message, {
      ...baseDiagInfo,
    });
  }
  emitDiagnostic('webgpu:device-ready');
  try { installWebGpuCapture(device); } catch (e) { /* best-effort; do not hard-fail */ }
  const context = canvas.getContext('webgpu') as unknown as GPUCanvasContext | null;
  if (!context) {
    return fail('webgpu:context-unavailable', 'WebGPU context unavailable', undefined, {
      ...baseDiagInfo,
      canvasId: mountCanvasId,
    });
  }
  emitDiagnostic('webgpu:context-ready');

  const format = navGpu.getPreferredCanvasFormat();
  let width = 1;
  let height = 1;
  let devicePixelRatio = window.devicePixelRatio || 1;
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

  const resolveControlsButton = (selector: string): HTMLButtonElement | null => {
    if (controlsRoot) {
      const candidate = controlsRoot.querySelector<HTMLButtonElement>(selector);
      if (candidate) {
        return candidate;
      }
    }
    const shell = canvas.parentElement;
    if (shell instanceof HTMLElement) {
      const scoped = shell.querySelector<HTMLButtonElement>(selector);
      if (scoped) {
        return scoped;
      }
    }
    return document.querySelector<HTMLButtonElement>(selector);
  };

  let autorotateButton: HTMLButtonElement | null = null;
  const resolveAutorotateButton = (): HTMLButtonElement | null => {
    if (autorotateButton && autorotateButton.isConnected) {
      return autorotateButton;
    }
    const button = resolveControlsButton('[data-role="autorotate"]');
    autorotateButton = button;
    return button;
  };

  const updateAutoButton = (): void => {
    const button = resolveAutorotateButton();
    if (!button) {
      return;
    }
    button.dataset.state = state.autoRotate ? 'on' : 'off';
    button.setAttribute('aria-pressed', state.autoRotate ? 'true' : 'false');
    const label = state.autoRotate ? 'Auto' : 'Manual';
    if (button.textContent !== label) {
      button.textContent = label;
    }
  };

  const notifyAutoRotateChange = (): void => {
    updateAutoButton();
    onAutoRotateChange?.(state.autoRotate);
  };

  let projectionButton: HTMLButtonElement | null = null;
  const updateProjectionButton = (): void => {
    const button =
      projectionButton && projectionButton.isConnected
        ? projectionButton
        : resolveControlsButton('[data-wgpu-action="projection"]');
    projectionButton = button;
    if (!button) {
      return;
    }
    const isPerspective = state.projectionMode === 'perspective';
    button.dataset.state = state.projectionMode;
    button.setAttribute('aria-pressed', isPerspective ? 'true' : 'false');
    const label = isPerspective ? 'Persp' : 'Ortho';
    if (button.textContent !== label) {
      button.textContent = label;
    }
  };

  let debugButton: HTMLButtonElement | null = null;
  const updateDebugButton = (): void => {
    const button =
      debugButton && debugButton.isConnected
        ? debugButton
        : resolveControlsButton('[data-wgpu-action="debug"]');
    debugButton = button;
    if (!button) {
      return;
    }
    const active = state.debugOverlay;
    button.dataset.state = active ? 'on' : 'off';
    button.textContent = active ? 'Debug*' : 'Debug';
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  };

  notifyAutoRotateChange();
  updateProjectionButton();
  updateDebugButton();

  let gridButton: HTMLButtonElement | null = null;
  const resolveGridButton = (): HTMLButtonElement | null => {
    if (gridButton && gridButton.isConnected) {
      return gridButton;
    }
    const button = resolveControlsButton('[data-wgpu-action="grid"]');
    gridButton = button;
    return button;
  };

  const updateGridButton = (): void => {
    const button = resolveGridButton();
    if (!button) return;
    const active = state.showGrid;
    button.dataset.state = active ? 'on' : 'off';
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    const label = active ? 'Grid*' : 'Grid';
    if (button.textContent !== label) {
      button.textContent = label;
    }
  };
  let axisButton: HTMLButtonElement | null = null;
  const resolveAxisButton = (): HTMLButtonElement | null => {
    if (axisButton && axisButton.isConnected) return axisButton;
    const button = resolveControlsButton('[data-wgpu-action="axis"]') || resolveControlsButton('#wgpu-toggle-axis');
    axisButton = button;
    return axisButton;
  };
  const updateAxisButton = (): void => {
    const button = resolveAxisButton();
    if (!button) return;
    const active = state.showAxis;
    button.dataset.state = active ? 'on' : 'off';
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    const label = active ? 'Axis*' : 'Axis';
    if (button.textContent !== label) {
      button.textContent = label;
    }
  };
  const updateArcballButton = (): void => {
    const btn = resolveControlsButton('[data-wgpu-action="arcball"]') || resolveControlsButton('#wgpu-toggle-arcball');
    if (!btn) {
      return;
    }
    const active = state.cameraMode === 'arcball';
    const label = active ? 'Arc*' : 'Arc';
    btn.textContent = label;
    btn.setAttribute('data-state', active ? 'on' : 'off');
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  };

  const updateFreeButton = (): void => {
    const btn = resolveControlsButton('[data-wgpu-action="fly"]') || resolveControlsButton('#wgpu-toggle-fly');
    if (!btn) {
      return;
    }
    const active = state.cameraMode === 'free';
    btn.textContent = active ? 'Free*' : 'Free';
    btn.setAttribute('data-state', active ? 'on' : 'off');
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  };

  const updateCameraModeButtons = (): void => {
    updateArcballButton();
    updateFreeButton();
  };

  let pivotAutoButton: HTMLButtonElement | null = null;
  const resolvePivotButton = (): HTMLButtonElement | null => {
    if (pivotAutoButton && pivotAutoButton.isConnected) return pivotAutoButton;
    const button = resolveControlsButton('[data-wgpu-action="pivot-auto"]') || resolveControlsButton('#wgpu-toggle-pivot');
    pivotAutoButton = button;
    return pivotAutoButton;
  };

  const updatePivotAutoButton = (): void => {
    const button = resolvePivotButton();
    if (!button) return;
    const active = Boolean(state.autoPivotFromCamera);
    button.dataset.state = active ? 'on' : 'off';
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    const label = active ? 'Pivot*' : 'Pivot';
    if (button.textContent !== label) button.textContent = label;
  };
  updateGridButton();
  updateAxisButton();
  updateCameraModeButtons();

  const buildCameraSnapshot = (): CameraSnapshot => ({
    rotX: state.rotX,
    rotY: state.rotY,
    zoom: state.zoom,
    panX: state.panX,
    panY: state.panY,
    autoRotate: state.autoRotate,
    sceneRadius: state.sceneRadius,
    projection: state.projectionMode,
    cameraMode: state.cameraMode,
    pivot: [...state.pivot],
    eye: [...(lastCameraRig?.eye ?? ensureFreePosition(state))],
  });

  const drawAxisIndicator = (ctx: CanvasRenderingContext2D | null, rig: CameraRig | null): void => {
    if (!ctx || !rig) return;
    try {
      const canvas = ctx.canvas as HTMLCanvasElement;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const axisLen = Math.min(w, h) * 0.34;
      const basis = rig.basis;
      // Project world axis to screen using camera basis vectors.
      // screenX = dot(worldAxis, camRight), screenY = dot(worldAxis, camUp)
      // This gives the 2D position where the axis tip appears on screen.
      const axisToScreen = (axis: [number, number, number]): [number, number] => {
        // camRight points screen-right, camUp points screen-up
        const screenX = axis[0] * basis.right[0] + axis[1] * basis.right[1] + axis[2] * basis.right[2];
        const screenY = axis[0] * basis.up[0] + axis[1] * basis.up[1] + axis[2] * basis.up[2];
        // Scale and convert to canvas coords (canvas Y is inverted from screen up)
        return [cx + screenX * axisLen, cy - screenY * axisLen];
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
      const diagAxes: Record<string, unknown> = {};
      for (const a of axes) {
        const [tx, ty] = axisToScreen(a.v);
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
        ctx.lineTo(tx - ux * Math.min(8, w * 0.06), ty - uy * Math.min(8, w * 0.06));
        ctx.stroke();
        const tipSize = Math.max(6, Math.round(w * 0.04));
        ctx.beginPath();
        ctx.fillStyle = a.color;
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - ux * tipSize - uy * (tipSize * 0.45), ty - uy * tipSize + ux * (tipSize * 0.45));
        ctx.lineTo(tx - ux * tipSize + uy * (tipSize * 0.45), ty - uy * tipSize - ux * (tipSize * 0.45));
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = `${Math.max(10, Math.round(w * 0.12))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lx = tx + ux * Math.max(6, Math.round(w * 0.02));
        const ly = ty + uy * Math.max(6, Math.round(w * 0.02));
        ctx.fillText(a.label, lx, ly);
        // Collect diagnostic vectors for overlay vs basis projection
        try {
          const ov_basis_unit = overlayForAxisFromBasis(rig, basis, a.v, state.pivot ?? [0, 0, 0], Math.max(state.sceneRadius, 1));
          const pivot = state.pivot ?? [0, 0, 0];
          const pA = mulMat4Vec4(rig.viewProjection, pivot[0], pivot[1], pivot[2]);
          const pB = mulMat4Vec4(rig.viewProjection, pivot[0] + a.v[0] * Math.max(state.sceneRadius, 1), pivot[1] + a.v[1] * Math.max(state.sceneRadius, 1), pivot[2] + a.v[2] * Math.max(state.sceneRadius, 1));
          const ov_proj_unit = ndcDirBetween(pA, pB);
          // convert to overlay coordinates: flip Y
          const ov_proj_2d = [ov_proj_unit[0], -ov_proj_unit[1]];
          const ov_proj_len = Math.hypot(ov_proj_2d[0], ov_proj_2d[1]);
          const ov_proj_norm = ov_proj_len < 1e-9 ? [0, 0] : [ov_proj_2d[0] / ov_proj_len, ov_proj_2d[1] / ov_proj_len];
          diagAxes[a.label] = { overlayProj: ov_proj_norm, overlayBasis: ov_basis_unit };
        } catch (err) {
          /* best-effort */
        }
      }
      // Emit diagnostic if enabled
      try {
        emitDiagnostic('component:axis-overlay-compare', { axes: diagAxes, ts: Date.now(), camSeq: cameraSequence });
      } catch (err) {/* ignore */ }
    } catch (err) {
      /* ignore drawing errors */
    }
  };

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
      prev.projection === next.projection &&
      prev.cameraMode === next.cameraMode &&
      Math.abs(prev.pivot[0] - next.pivot[0]) <= CAMERA_EPSILON &&
      Math.abs(prev.pivot[1] - next.pivot[1]) <= CAMERA_EPSILON &&
      Math.abs(prev.pivot[2] - next.pivot[2]) <= CAMERA_EPSILON &&
      Math.abs(prev.eye[0] - next.eye[0]) <= CAMERA_EPSILON &&
      Math.abs(prev.eye[1] - next.eye[1]) <= CAMERA_EPSILON &&
      Math.abs(prev.eye[2] - next.eye[2]) <= CAMERA_EPSILON
    );
  };

  let lastCameraSnapshot: CameraSnapshot | null = null;
  let cameraSequence = 0;
  let pendingStaticCameraEmit = false;

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
    // Emit a compact diagnostic snapshot for correlation with uniform writes and overlay draws
    try {
      emitDiagnostic('component:camera-state', {
        ts: Date.now(),
        seq: cameraSequence,
        rotX: snapshot.rotX,
        rotY: snapshot.rotY,
        zoom: snapshot.zoom,
        canvasId: mountCanvasId,
      });
    } catch (err) {/* best-effort */ }
    pendingStaticCameraEmit = false;
    postToHost(emit, {
      type: 'cameraState',
      payload: {
        ...snapshot,
        timestamp: Date.now(),
        seq: cameraSequence,
      },
    });
  };

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

  let cameraEmitTimer: number | null = null;
  let lastGradientSignature: string | null = null;
  let validationFrameCounter = 0;
  let lastValidGeometry: GeometrySnapshot | null = null;

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

  let lastResizeSignature: string | null = null;

  // Track last resize dimensions to prevent redundant resize calls that could
  // invalidate textures mid-render (causing WebGPU swapchain errors)
  let lastResizeWidth = 0;
  let lastResizeHeight = 0;
  let lastFullscreenState = false;

  const initialBgMode = (initialParams as Record<string, unknown>).__pf_bg_mode;
  let currentAlphaMode: 'opaque' | 'premultiplied' = resolveAlphaMode(initialBgMode);

  const resize = (): void => {
    // Get the TARGET dimensions from the PARENT container
    // The canvas has inline styles, so we can't query it directly
    // The parent container uses CSS flex/grid and tells us the available space
    const isFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
    let cssWidth: number;
    let cssHeight: number;

    if (isFullscreen) {
      // Fullscreen: use full window dimensions
      cssWidth = window.innerWidth;
      cssHeight = window.innerHeight;
    } else {
      // Normal mode: query PARENT container for available space
      const parent = canvas.parentElement;
      if (parent) {
        const rect = parent.getBoundingClientRect();
        cssWidth = rect.width;
        cssHeight = rect.height;
      } else {
        // Fallback to window
        cssWidth = window.innerWidth;
        cssHeight = window.innerHeight;
      }
    }

    const nextDpr = window.devicePixelRatio || 1;
    const nextWidth = Math.max(1, Math.round(cssWidth * nextDpr));
    const nextHeight = Math.max(1, Math.round(cssHeight * nextDpr));

    // Track fullscreen state changes - force resize when fullscreen toggles
    const fullscreenChanged = isFullscreen !== lastFullscreenState;
    lastFullscreenState = isFullscreen;

    // Skip if dimensions haven't changed AND fullscreen state is the same
    // This prevents texture invalidation mid-render, but allows fullscreen transitions
    if (nextWidth === lastResizeWidth && nextHeight === lastResizeHeight && !fullscreenChanged) {
      return;
    }
    lastResizeWidth = nextWidth;
    lastResizeHeight = nextHeight;

    if (Math.abs(nextDpr - devicePixelRatio) > 1e-3) {
      devicePixelRatio = nextDpr;
      if (debugEnabled) {
        emitDiagnostic('canvas:dpr-change', { dpr: devicePixelRatio });
      }
    }
    width = nextWidth;
    height = nextHeight;
    // Don't set inline styles - CSS position:absolute with inset:0 controls display size
    // Only set the pixel buffer to match the parent container dimensions
    canvas.width = width;
    canvas.height = height;
    context.configure({ device, format, alphaMode: currentAlphaMode });
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
    state.canvasAspect = height > 0 ? width / height : 1;
    // Force projection matrix recalculation on next frame
    state.cameraDirty = true;
    // Invalidate ALL cached camera rigs so they're rebuilt with new aspect ratio
    // Module-level cache:
    lastCameraRig = null;
    // Mount-closure cache (used by getCachedRig) - wrapped in try-catch because
    // these variables are defined later in the file and may not exist during
    // the initial resize() call at mount time
    try {
      // @ts-ignore - lastRigSignature/lastRigCached are defined later in mount()
      if (typeof lastRigSignature !== 'undefined') lastRigSignature = null;
      // @ts-ignore
      if (typeof lastRigCached !== 'undefined') lastRigCached = null;
    } catch (e) {
      // Ignore - variables not yet defined during initial mount
    }
    console.log('[WebGPU] Resize:', width, 'x', height, 'aspect:', state.canvasAspect.toFixed(3));
    if (debugEnabled) {
      const signature = `${width}x${height}@${Math.round(devicePixelRatio * 100) / 100}`;
      if (signature !== lastResizeSignature) {
        lastResizeSignature = signature;
        emitDiagnostic('canvas:resize', {
          width,
          height,
          cssWidth: Math.round(cssWidth),
          cssHeight: Math.round(cssHeight),
          dpr: devicePixelRatio,
        });
      }
    }
    // Update axis overlay size to be crisp on DPR-scaled devices
    try {
      if (axisCanvas) {
        const overlaySizeCss = 96; // CSS px
        const overlayW = Math.max(1, Math.round(overlaySizeCss * devicePixelRatio));
        const overlayH = overlayW;
        axisCanvas.width = overlayW;
        axisCanvas.height = overlayH;
        axisCanvas.style.width = `${overlaySizeCss}px`;
        axisCanvas.style.height = `${overlaySizeCss}px`;
      }
    } catch (err) {
      /* ignore overlay resize errors */
    }
  };

  window.addEventListener('resize', resize);
  // Trigger resize on fullscreen changes (browser fullscreen API doesn't always fire resize)
  const handleFullscreenChange = (): void => {
    setTimeout(resize, 100);
  };
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

  // Use ResizeObserver to detect parent container size changes
  // We watch the parent because the canvas has inline pixel styles that don't change
  // When the parent container resizes (e.g., sidebar toggle), we need to resize the canvas
  let resizeObserver: ResizeObserver | null = null;
  const parentContainer = canvas.parentElement;
  if (parentContainer) {
    try {
      resizeObserver = new ResizeObserver(() => {
        // Debounce to avoid excessive resize calls
        requestAnimationFrame(resize);
      });
      resizeObserver.observe(parentContainer);
      console.log('[WebGPU] ResizeObserver attached to parent container');
    } catch (err) {
      // ResizeObserver not supported, fall back to window resize only
      console.warn('[WebGPU] ResizeObserver not available, using window resize only');
    }
  }

  resize();

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

  // Axis overlay canvas for small 2D axis gizmo in corner
  let axisCanvas: HTMLCanvasElement | null = null;
  let axisCtx: CanvasRenderingContext2D | null = null;
  const AXIS_POS_KEY = 'pf-axis-position';

  // Load saved position from localStorage
  const loadAxisPosition = (): { left: number; bottom: number } | null => {
    try {
      const saved = localStorage.getItem(AXIS_POS_KEY);
      if (saved) {
        const pos = JSON.parse(saved);
        if (typeof pos.left === 'number' && typeof pos.bottom === 'number') {
          return pos;
        }
      }
    } catch { /* ignore */ }
    return null;
  };

  // Save position to localStorage
  const saveAxisPosition = (left: number, bottom: number): void => {
    try {
      localStorage.setItem(AXIS_POS_KEY, JSON.stringify({ left, bottom }));
    } catch { /* ignore */ }
  };

  try {
    const parent = canvas.parentElement || document.body;

    // Remove any existing axis overlay to prevent duplicates
    const existingAxis = document.getElementById('wgpu-axis-overlay');
    if (existingAxis) {
      existingAxis.remove();
    }

    axisCanvas = document.createElement('canvas');
    axisCanvas.id = 'wgpu-axis-overlay';
    axisCanvas.style.position = 'absolute';
    axisCanvas.style.cursor = 'move';
    axisCanvas.style.pointerEvents = 'auto';
    axisCanvas.style.zIndex = '9998';
    axisCanvas.width = 96;
    axisCanvas.height = 96;
    axisCanvas.style.width = '96px';
    axisCanvas.style.height = '96px';

    // Load saved position or use default
    const savedPos = loadAxisPosition();
    if (savedPos) {
      axisCanvas.style.left = `${savedPos.left}px`;
      axisCanvas.style.bottom = `${savedPos.bottom}px`;
    } else {
      axisCanvas.style.left = '8px';
      axisCanvas.style.bottom = '8px';
    }

    // Drag state
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let startLeft = 0;
    let startBottom = 0;

    const onMouseDown = (e: MouseEvent) => {
      if (!axisCanvas) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      startLeft = parseInt(axisCanvas.style.left, 10) || 8;
      startBottom = parseInt(axisCanvas.style.bottom, 10) || 8;
      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging || !axisCanvas) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      const newLeft = Math.max(0, startLeft + dx);
      const newBottom = Math.max(0, startBottom - dy);
      axisCanvas.style.left = `${newLeft}px`;
      axisCanvas.style.bottom = `${newBottom}px`;
    };

    const onMouseUp = () => {
      if (!isDragging || !axisCanvas) return;
      isDragging = false;
      const left = parseInt(axisCanvas.style.left, 10) || 8;
      const bottom = parseInt(axisCanvas.style.bottom, 10) || 8;
      saveAxisPosition(left, bottom);
    };

    axisCanvas.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    parent?.appendChild(axisCanvas);
    axisCtx = axisCanvas.getContext('2d');
  } catch (e) {
    axisCanvas = null;
    axisCtx = null;
  }

  let wgsl = WGSL_SOURCE ?? '';
  if (typeof wgsl !== 'string') {
    console.warn('[WebGPU] WGSL import not a string; coercing to string', wgsl);
    try {
      wgsl = String(wgsl);
    } catch (err) {
      wgsl = '';
    }
  }
  const wgslSnippet = (wgsl ?? '').slice(0, 512).replace(/\n/g, ' ');
  const hasVs = wgsl.indexOf('fn vs_main(') >= 0 || wgsl.indexOf('@vertex') >= 0;
  const hasFs = wgsl.indexOf('fn fs_main(') >= 0 || wgsl.indexOf('@fragment') >= 0;
  const hasBinding0 = wgsl.indexOf('@group(0) @binding(0)') >= 0 || wgsl.indexOf('@binding(0)') >= 0;
  const hasBinding1 = wgsl.indexOf('@group(0) @binding(1)') >= 0 || wgsl.indexOf('@binding(1)') >= 0;
  const hasBinding2 = wgsl.indexOf('@group(0) @binding(2)') >= 0 || wgsl.indexOf('@binding(2)') >= 0;
  const hasBinding3 = wgsl.indexOf('@group(0) @binding(3)') >= 0 || wgsl.indexOf('@binding(3)') >= 0;
  const hasBinding4 = wgsl.indexOf('@group(0) @binding(4)') >= 0 || wgsl.indexOf('@binding(4)') >= 0;
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
  const shaderModule = await createShaderModule(device as any, wgsl, 'potfoundry-webgpu');

  const pipeline = await createPipeline(device, format, shaderModule, setStatus, emitDiagnostic, wgsl);
  if (!pipeline) {
    emitErrorEvent({
      code: 'webgpu:pipeline-failed',
      message: 'WebGPU • pipeline creation failed',
      fatal: true,
    });
    return null;
  }
  emitDiagnostic('webgpu:pipeline-ready');

  // Create wireframe pipeline with line-list topology for triangle edges
  let wireframePipeline: GPURenderPipeline | null = null;
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
  } catch (err) {
    console.warn('Failed to create wireframe pipeline:', err);
    emitDiagnostic('webgpu:wireframe-pipeline-failed', { error: err instanceof Error ? err.message : String(err) });
    // Continue without wireframe - it's optional
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
  const bufferUsage = ((globalThis as Record<string, unknown>).GPUBufferUsage as
    | { UNIFORM?: number; COPY_DST?: number; STORAGE?: number }
    | undefined) ?? { UNIFORM: 0x40, COPY_DST: 0x08, STORAGE: 0x20 };
  const uniformUsage = bufferUsage.UNIFORM ?? 0x40;
  const copyDstUsage = bufferUsage.COPY_DST ?? 0x08;
  const storageUsage = bufferUsage.STORAGE ?? 0x20;

  const uniformBuffer = device.createBuffer({
    label: 'component:uniform-buffer',
    size: uniformSize,
    usage: uniformUsage | copyDstUsage,
  });

  const colorBuffers = {
    c1: device.createBuffer({ label: 'component:color-buffer-1', size: 16, usage: uniformUsage | copyDstUsage }),
    c2: device.createBuffer({ label: 'component:color-buffer-2', size: 16, usage: uniformUsage | copyDstUsage }),
    c3: device.createBuffer({ label: 'component:color-buffer-3', size: 16, usage: uniformUsage | copyDstUsage }),
  };
  // Preallocated Float32Array scratch buffers used to avoid allocation in
  // the hot render path when updating gradient colors.
  const colorBufC1 = new Float32Array(4);
  const colorBufC2 = new Float32Array(4);
  const colorBufC3 = new Float32Array(4);
  const writeGradient = (
    device: GPUDevice,
    buffers: { c1: GPUBuffer; c2: GPUBuffer; c3: GPUBuffer },
    gradient: unknown
  ): void => {
    const stops = Array.isArray(gradient) ? gradient : [];
    const c1 = hexToRgbNorm(stops[0]);
    const c2 = hexToRgbNorm(stops[1] ?? stops[0]);
    const c3 = hexToRgbNorm(stops[2] ?? stops[1] ?? stops[0]);
    colorBufC1[0] = c1[0]; colorBufC1[1] = c1[1]; colorBufC1[2] = c1[2]; colorBufC1[3] = 0;
    colorBufC2[0] = c2[0]; colorBufC2[1] = c2[1]; colorBufC2[2] = c2[2]; colorBufC2[3] = 0;
    colorBufC3[0] = c3[0]; colorBufC3[1] = c3[1]; colorBufC3[2] = c3[2]; colorBufC3[3] = 0;
    device.queue.writeBuffer(buffers.c1, 0, colorBufC1.buffer);
    device.queue.writeBuffer(buffers.c2, 0, colorBufC2.buffer);
    device.queue.writeBuffer(buffers.c3, 0, colorBufC3.buffer);
    try { (window as any).__pf_webgpu_mounts[mountCanvasId as string]?.debug?.metrics && ((window as any).__pf_webgpu_mounts[mountCanvasId as string].debug.metrics.colorWrites += 3); } catch (e) { /* ignore */ }
  };

  const styleParamBuffer = device.createBuffer({
    label: 'component:style-params',
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
      try { (window as any).__pf_webgpu_mounts[mountCanvasId as string]?.debug?.metrics && ((window as any).__pf_webgpu_mounts[mountCanvasId as string].debug.metrics.styleParamWrites += 1); } catch (e) { /* ignore */ }
    }
  };

  const bindGroup = device.createBindGroup({
    label: 'component:bind-group-main',
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: colorBuffers.c1 } },
      { binding: 2, resource: { buffer: colorBuffers.c2 } },
      { binding: 3, resource: { buffer: colorBuffers.c3 } },
      { binding: 4, resource: { buffer: styleParamBuffer } },
    ],
  });
  emitDiagnostic('webgpu:bind-group-ready', {
    layoutEntries: pipeline.getBindGroupLayout(0) ? 'ok' : 'missing',
    canvasId: mountCanvasId,
  });
  // Also log to the console for immediate dev feedback
  console.debug('[WebGPU:diag] bind-group-ready', { layoutEntries: pipeline.getBindGroupLayout(0) });

  // Create wireframe bind group if wireframe pipeline exists
  // Note: The wireframe shader only uses bindings 0 (uniforms) and 4 (style params)
  // It does NOT use the color buffers (bindings 1, 2, 3)
  let wireframeBindGroup: GPUBindGroup | null = null;
  if (wireframePipeline) {
    try {
      wireframeBindGroup = device.createBindGroup({
        label: 'component:bind-group-wireframe',
        layout: wireframePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 4, resource: { buffer: styleParamBuffer } },
        ],
      });
      emitDiagnostic('webgpu:wireframe-bind-group-ready');
    } catch (err) {
      console.warn('Failed to create wireframe bind group:', err);
      wireframePipeline = null; // Disable wireframe if bind group fails
    }
  }

  let current: WebGPUParams | null = null;
  let hasLocalCameraControl = false;
  let localControlResetTimer: number | null = null;
  let lastCameraNonce: number | null = null;
  // Focus tween now owned by the CameraController instance

  // Pointer state is defined in camera_controller and imported.

  const pointer: PointerState = {
    active: false,
    mode: 'orbit' as any,
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
  };

  // Instantiate controller after pointer and state are created


  const FREE_MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'r', 'f']);
  const freeKeyboard = {
    activeKeys: new Set<string>(),
    boost: false,
  };
  const clearFreeMovementKeys = (): void => {
    freeKeyboard.activeKeys.clear();
    freeKeyboard.boost = false;
  };

  // resolveActiveBasis and controller wrappers will be defined after cameraController is instantiated.

  // Cache recently-built camera rigs keyed by a compact signature to avoid
  // recomputing the rig for every frame when the inputs are unchanged.
  let lastRigSignature: string | null = null;
  let lastRigCached: CameraRig | null = null;
  const computeRigSignature = (s: WebGPUState, paddingHint?: number | null, phw?: number | null, phh?: number | null): string => {
    const basis = (s.displayCamQuat ?? s.camQuat) as any;
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
    console.debug('[WebGPU] Rig cache MISS - aspect:', s.canvasAspect?.toFixed(3));
    const rig = buildCameraRig(s, paddingHint ?? CAMERA_PADDING, phw, phh);
    try { (window as any).__pf_webgpu_mounts[mountCanvasId as string]?.debug?.metrics && ((window as any).__pf_webgpu_mounts[mountCanvasId as string].debug.metrics.rigRebuilds += 1); } catch (e) { /* ignore */ }
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

  const controllerHelpers: ControllerHelpers = {
    resolveInteractionRig: resolveInteractionRig,
    ensureInteractiveBasis: ensureInteractiveBasisLocal,
    computePanFactor: computePanFactor,
    updatePivotFromPan: () => updatePivotFromPan(),
    requestCameraEmitWhenStatic: () => requestCameraEmitWhenStatic(),
    markInteraction: (shouldCancel?: boolean) => markInteraction(shouldCancel),
    worldRayFromCanvas: (rig: unknown, canvasEl: HTMLCanvasElement, x: number, y: number) => worldRayFromCanvas(rig as CameraRig, canvasEl, x, y),
    intersectRayZPlane: (ray: any, z: number) => intersectRayZPlane(ray as any, z),
    intersectRayCylinder: (ray: any, radius: number, minZ: number, maxZ: number) => intersectRayCylinder(ray as any, radius, minZ, maxZ),
    buildCameraRig: (s: WebGPUState, paddingHint: number, phw?: number | null, phh?: number | null) => getCachedRig(s, paddingHint, phw, phh),
    clampZoomValue: (v: number) => clampZoomValue(v),
    cancelCameraEmit: () => cancelCameraEmit(),
    setAutoRotate: (v: boolean, emit?: boolean) => setAutoRotate(v, emit),
    setCameraMode: (mode: CameraMode) => setCameraMode(mode),
    freeKeyboard,
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
        device.queue.writeBuffer(uniformBuffer, 0, uniform.buffer as ArrayBuffer);
        emitDiagnostic('component:write-uniforms-immediate', { afterCommit: true });
      } catch (err) {
        /* best-effort */
      }
    },
  };

  // Instantiate controller after pointer and helpers are ready
  cameraController = new CameraController(state, pointer, canvas, controllerHelpers);
  // Propagate hostCameraAcceptPolicy from initial params (default 'grace')
  try {
    const policy = (initialParams as any)?.hostCameraAcceptPolicy as 'always' | 'grace' | 'strict' | undefined;
    if (policy && cameraController && typeof cameraController.setHostCameraAcceptPolicy === 'function') {
      cameraController.setHostCameraAcceptPolicy(policy);
    }
    const graceMs = Number((initialParams as any)?.localCameraGraceMs ?? (initialParams as any)?.hostCameraGraceMs ?? null);
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
    if (!(window as any).__pf_webgpu_camera_controller) {
      (window as any).__pf_webgpu_camera_controller = cameraController;
    } else {
      try {
        // Helpful debug message for developers: don't clobber an existing controller.
        console.debug('[WebGPU] window.__pf_webgpu_camera_controller already present — not overriding');
      } catch (e) {
        /* ignore console errors */
      }
    }
  } catch (err) {
    /* ignore attach failures */
  }

  // Assign the real implementation to the forward-declared variable
  commitDisplayBasisToState = function (state: WebGPUState): boolean {
    console.log('[WebGPU] commitDisplayBasisToState invoked');
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
        const pA = (mulMat4Vec4 as any)(rig.viewProjection, state.pivot?.[0] ?? 0, state.pivot?.[1] ?? 0, state.pivot?.[2] ?? 0);
        const pB = (mulMat4Vec4 as any)(rig.viewProjection, (state.pivot?.[0] ?? 0) + testAxis[0] * worldScale, (state.pivot?.[1] ?? 0) + testAxis[1] * worldScale, (state.pivot?.[2] ?? 0) + testAxis[2] * worldScale);
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
            console.debug('[WebGPU] parity_check pre-commit', { ov_basis_unit, ov_proj_unit, dotAlign });
            if (dotAlign < BASIS_FLIP_DOT_THRESHOLD && !state.interacting && !state.disableAutoFlip) {
              state.displayCamRight = vec3Scale(state.displayCamRight, -1);
              state.displayCamUp = vec3Scale(state.displayCamUp, -1);
              emitDiagnostic('component:display-basis-parity_flip', { dotAlign });
              console.debug('[WebGPU] display-basis-parity_flip performed', { displayCamRight: state.displayCamRight, displayCamUp: state.displayCamUp });
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
      const pA = (mulMat4Vec4 as any)(rig.viewProjection, state.pivot?.[0] ?? 0, state.pivot?.[1] ?? 0, state.pivot?.[2] ?? 0);
      const pB = (mulMat4Vec4 as any)(rig.viewProjection, (state.pivot?.[0] ?? 0) + testAxis[0] * worldScale, (state.pivot?.[1] ?? 0) + testAxis[1] * worldScale, (state.pivot?.[2] ?? 0) + testAxis[2] * worldScale);
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
          console.debug('[WebGPU] parity_check pre-commit-final', { ov_basis_unit, ov_proj_unit, dotAlign });
          if (dotAlign < BASIS_FLIP_DOT_THRESHOLD && !state.interacting && !state.disableAutoFlip) {
            committedBasis.right = vec3Scale(committedBasis.right, -1);
            committedBasis.up = vec3Scale(committedBasis.up, -1);
            emitDiagnostic('component:committed-basis-parity_flip', { dotAlign });
            console.debug('[WebGPU] committed-basis-parity_flip performed', { committedBasisRight: committedBasis.right, committedBasisUp: committedBasis.up });
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
    state.recentBasisCommit = { right: [...committedBasis.right], up: [...committedBasis.up], forward: [...committedBasis.forward] } as any;
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
          const cylinderHit = intersectRayCylinder(ray as any, extents.paddedHalfWidth, -extents.paddedHalfHeight, extents.paddedHalfHeight) ?? null;
          const hit = cylinderHit ?? intersectRayZPlane(ray as any, pivotZ) ?? null;
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
      device.queue.writeBuffer(uniformBuffer, 0, uniform.buffer as ArrayBuffer);
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
  function applyFreeLookRotation(dx: number, dy: number): void {
    if (typeof cameraController !== 'undefined' && cameraController) {
      return cameraController.applyFreeLookRotation(dx, dy);
    }
    return;
  }
  function applyFreeLookPan(dx: number, dy: number): void {
    if (typeof cameraController !== 'undefined' && cameraController) {
      return cameraController.applyFreeLookPan(dx, dy);
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

  const requestCameraEmitWhenStatic = (): void => {
    pendingStaticCameraEmit = true;
    cancelCameraEmit();
  };

  function markInteraction(shouldCancelFocus = true): void {
    hasLocalCameraControl = true;
    if (!cameraController) return;
    return cameraController.markInteraction(shouldCancelFocus);
  }

  const setCameraMode = (nextMode: CameraMode): void => {
    cancelFocusTween();
    if (state.cameraMode === nextMode) {
      return;
    }
    const prevMode = state.cameraMode;

    if (nextMode === 'free') {
      try {
        const { rig } = resolveInteractionRig();
        state.freePosition = [...rig.eye];
      } catch (err) {
        /* ignore */
      }
      state.orbitZoom = clampZoomValue(state.zoom || state.orbitZoom || 1.0);
      state.cameraMode = 'free';
      state.zoom = 1.0;
      state.displayCamRight = null;
      state.displayCamUp = null;
      state.displayCamForward = null;
      state.displayCamQuat = null;
      state.displayRotX = null;
      state.displayRotY = null;
      resetInertia(state);
      clearFreeMovementKeys();
      setAutoRotate(false, false);
      updateCameraModeButtons();
      state.cameraDirty = true;
      requestCameraEmitWhenStatic();
      return;
    }

    if (prevMode === 'free') {
      const basis = resolveActiveBasis(state);
      const eye = ensureFreePosition(state);
      const pivotZ = state.pivot?.[2] ?? 0;
      const ray: Ray = { origin: eye, dir: vec3Normalize(basis.forward) };
      const hit = intersectRayZPlane(ray, pivotZ);
      if (hit) {
        state.panX = hit[0];
        state.panY = hit[1];
        updatePivotFromPan();
      }
      try {
        const { extents } = resolveInteractionRig();
        const target: Vec3 = [state.panX, state.panY, pivotZ];
        const distance = vec3Length(vec3Subtract(target, eye));
        if (Number.isFinite(distance) && distance > 1e-3) {
          const zoomFromDistance =
            (extents.paddedMax * CAMERA_DISTANCE_FALLOFF) / Math.max(distance, 1e-3);
          state.zoom = clampZoomValue(zoomFromDistance);
        } else {
          state.zoom = clampZoomValue(state.orbitZoom || state.zoom || 1.0);
        }
      } catch (err) {
        state.zoom = clampZoomValue(state.orbitZoom || state.zoom || 1.0);
      }
      state.orbitZoom = state.zoom;
      state.camRight = [...basis.right];
      state.camUp = [...basis.up];
      state.camForward = [...basis.forward];
      state.camQuat = quaternionFromBasis(basis);
      const { rotX, rotY } = cbSyncAnglesFromBasis(basis);
      state.rotX = rotX;
      state.rotY = wrapTau(rotY);
      state.displayCamRight = null;
      state.displayCamUp = null;
      state.displayCamForward = null;
      state.displayCamQuat = null;
      state.displayRotX = null;
      state.displayRotY = null;
      clearFreeMovementKeys();
    }

    state.cameraMode = nextMode;
    state.useArcball = nextMode === 'arcball';
    resetInertia(state);
    updateCameraModeButtons();
    state.cameraDirty = true;
    requestCameraEmitWhenStatic();
  };

  const applyCameraPayload = (payload: WebGPUParams | null | undefined, force: boolean): void => {
    // Delegate to CameraController when available. This centralizes payload
    // logic so both preview and component behave consistently.
    if (typeof cameraController !== 'undefined' && cameraController) {
      // update debug mount before delegating
      try {
        const dbg = mountCanvasId ? (window as any).__pf_webgpu_mounts?.[mountCanvasId]?.debug : undefined;
        if (dbg && payload) dbg.lastApplyCameraPayload = { fields: Object.keys(payload as WebGPUParams), timestamp: Date.now() };
      } catch (err) {/* ignore */ }
      cameraController.setPayload(payload, { force });
      return;
    }
    if (!payload) {
      return;
    }
    const allowCamera = force || !hasLocalCameraControl;
    // Avoid applying unchanged camera payloads unless forced.
    try {
      if (!force && sharedCameraPayloadDiffers) {
        const differs = sharedCameraPayloadDiffers(state as any, payload as any);
        if (!differs) return;
      }
    } catch (err) {
      /* ignore */
    }
    try {
      const dbg = mountCanvasId ? (window as any).__pf_webgpu_mounts?.[mountCanvasId]?.debug : undefined;
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
            const paddedMax = Math.max(paddedHalfWidth, paddedHalfHeight, 1);
            const baseDistance = paddedMax * CAMERA_DISTANCE_FALLOFF;
            const currentRig = getCachedRig(state, paddingHint, paddedHalfWidth, paddedHalfHeight);
            if (state.projectionMode === 'perspective' && nextMode === 'ortho') {
              const aspect = Math.max(state.canvasAspect || 1, 1e-3);
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
              const aspect = Math.max(state.canvasAspect || 1, 1e-3);
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
        const rev = (state as any).recentInertia as Record<string, unknown> | undefined;
        if (rev) {
          emitDiagnostic('component:inertia', rev);
          try { delete (state as any).recentInertia; } catch (e) {/* best-effort */ }
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
      hasLocalCameraControl = false;
    }
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
        cameraMutated = true;
      }
    }

    const patch: WebGPUParams = {};
    let patchApplied = false;
    if (typeof payload.rotX === 'number') {
      patch.rotX = payload.rotX;
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
      const isForce = Boolean((payload as Record<string, unknown>)?.force) || false;
      applyCameraPayload(patch, isForce);
      cameraMutated = true;
    }

    if (typeof payload.autoRotate === 'boolean') {
      setAutoRotate(payload.autoRotate, false);
      cameraMutated = true;
    }

    if (typeof payload.projection === 'string') {
      const nextMode = payload.projection === 'perspective' ? 'perspective' : 'ortho';
      if (state.projectionMode !== nextMode) {
        state.projectionMode = nextMode;
        updateProjectionButton();
        cameraMutated = true;
      }
    }

    // Handle projectionMode (alias for projection)
    if (typeof payload.projectionMode === 'string') {
      const nextMode = payload.projectionMode === 'perspective' ? 'perspective' : 'ortho';
      if (state.projectionMode !== nextMode) {
        state.projectionMode = nextMode;
        updateProjectionButton();
        cameraMutated = true;
      }
    }

    // Handle viewPreset (alias for preset)
    if (typeof payload.viewPreset === 'string') {
      applyViewPreset(state, payload.viewPreset);
      cameraMutated = true;
    }

    // Handle cameraMode (turntable/arcball/free)
    if (isCameraMode(payload.cameraMode)) {
      if (state.cameraMode !== payload.cameraMode) {
        setCameraMode(payload.cameraMode);
        cameraMutated = true;
      }
    }

    // Handle grid toggle
    if (payload.toggleGrid === true) {
      state.showGrid = !state.showGrid;
      updateGridButton();
      state.cameraDirty = true;
    }

    // Handle axis toggle
    if (payload.toggleAxis === true) {
      state.showAxis = !state.showAxis;
      updateAxisButton();
      state.cameraDirty = true;
    }

    if (cameraMutated) {
      markInteraction();
    }
  };

  const releasePointer = (): void => cameraController?.releasePointer?.();

  const preventContextMenu = (event: Event): void => {
    event.preventDefault();
  };
  canvas.addEventListener('contextmenu', preventContextMenu);

  const handlePointerDown = (event: PointerEvent): void => {
    try {
      if (debugEnabled) emitDiagnostic('webgpu:pointer-down', { x: event.clientX, y: event.clientY, button: event.button, canvasId: mountCanvasId });
    } catch (e) {
      /* ignore */
    }
    if (localControlResetTimer !== null) {
      window.clearTimeout(localControlResetTimer);
      localControlResetTimer = null;
    }
    hasLocalCameraControl = true;
    cameraController?.onPointerDown?.(event);
  };
  canvas.addEventListener('pointerdown', handlePointerDown);

  const handlePointerRelease = (): void => {
    try {
      if (debugEnabled) emitDiagnostic('webgpu:pointer-up', { canvasId: mountCanvasId });
    } catch (e) { /* ignore */ }
    if (localControlResetTimer !== null) {
      window.clearTimeout(localControlResetTimer);
      localControlResetTimer = null;
    }
    // Defer clearing local camera control briefly to avoid immediate
    // remote updates overriding the user's local camera changes.
    localControlResetTimer = window.setTimeout(() => {
      localControlResetTimer = null;
      hasLocalCameraControl = false;
    }, 250);
    cameraController?.onPointerRelease?.();
  };

  canvas.addEventListener('pointerup', handlePointerRelease);
  canvas.addEventListener('pointercancel', handlePointerRelease);
  window.addEventListener('pointerup', handlePointerRelease);

  const handlePointerMove = (event: PointerEvent): void => {
    try {
      if (debugEnabled) emitDiagnostic('webgpu:pointer-move', { x: event.clientX, y: event.clientY, canvasId: mountCanvasId });
    } catch (e) { /* ignore */ }
    cameraController?.onPointerMove?.(event);
  };
  canvas.addEventListener('pointermove', handlePointerMove);

  const handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (state.cameraMode === 'free') {
      applyFreeLookDolly(-event.deltaY);
    } else {
      const k = Math.exp(-event.deltaY * 0.001);
      zoomCameraAtCursor(event.clientX, event.clientY, k);
    }
    markInteraction();
    scheduleCameraEmit();
  };

  const handleDoubleClick = (event: MouseEvent): void => {
    // Only respond to left-button double-clicks
    if (event.button !== 0) return;
    event.preventDefault();
    focusCameraAtCursor(event.clientX, event.clientY);
  };

  const handleControlsClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const preset = target.dataset.wgpuView;
    if (preset) {
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
      return;
    }
    const action = target.dataset.wgpuAction;
    if (action === 'projection') {
      // Compute padded extents to compute a stable visual mapping between
      // perspective and orthographic modes so the pot remains similar on screen
      const cfg = { ...initialParams, ...current } as WebGPUParams;
      const height = clampNumber(cfg.H, 120.0);
      const safeHeight = Math.max(Math.abs(height), 1);
      const radiusTop = clampNumber(cfg.Rt ?? cfg.Rt, 70.0);
      const radiusBottom = clampNumber(cfg.Rb ?? cfg.Rb, 45.0);
      const safeRadiusTop = Math.max(Math.abs(radiusTop), 1);
      const safeRadiusBottom = Math.max(Math.abs(radiusBottom), 1);
      const computedMaxWithHeight = Math.max(safeHeight, safeRadiusTop, safeRadiusBottom);
      const rawPadding = typeof cfg.scenePadding === 'number' ? clampNumber(cfg.scenePadding, CAMERA_PADDING) : CAMERA_PADDING;
      const paddingHint = sanitizePadding(rawPadding);
      const halfHeight = Math.max(safeHeight * 0.5, 1);
      const outerRadius = Math.max(safeRadiusTop, safeRadiusBottom);
      const halfWidth = Math.max(outerRadius, 1);
      const paddedHalfWidth = Math.max(1, halfWidth * paddingHint);
      const paddedHalfHeight = Math.max(1, halfHeight * paddingHint);
      const paddedMax = Math.max(paddedHalfWidth, paddedHalfHeight, 1);
      const baseDistance = paddedMax * CAMERA_DISTANCE_FALLOFF;
      const oldMode = state.projectionMode;
      // Build current camera rig to extract fov/distance for mapping
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
      return;
    }
    if (action === 'debug') {
      state.debugOverlay = !state.debugOverlay;
      updateDebugButton();
      return;
    }
    if (action === 'arcball') {
      const targetMode: CameraMode = state.cameraMode === 'arcball' ? 'turntable' : 'arcball';
      setCameraMode(targetMode);
      markInteraction();
      emitCameraState(true);
      return;
    }
    if (action === 'fly') {
      const fallbackOrbit: CameraMode = state.useArcball ? 'arcball' : 'turntable';
      const targetMode: CameraMode = state.cameraMode === 'free' ? fallbackOrbit : 'free';
      setCameraMode(targetMode);
      markInteraction();
      emitCameraState(true);
      return;
    }
    if (action === 'grid') {
      state.showGrid = !state.showGrid;
      updateGridButton();
      // grid is a visual aid, mark cameraDirty so uniforms are re-written
      state.cameraDirty = true;
      return;
    }
    if (action === 'axis') {
      state.showAxis = !state.showAxis;
      updateAxisButton();
      // axis is a visual aid, mark cameraDirty so overlay is updated
      state.cameraDirty = true;
      return;
    }
    if (action === 'pivot-auto') {
      toggleAutoPivot();
      markInteraction();
      emitCameraState(true);
      return;
    }
    if (target.dataset.role === 'autorotate') {
      toggleAutoRotate();
      markInteraction();
      emitCameraState(true);
      return;
    }
  };
  if (controlsRoot) {
    controlsRoot.addEventListener('click', handleControlsClick);
  }

  const handleKeydown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return;
    }
    const normalizedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    // Enable WASD/QE in ALL camera modes - free mode uses 3D movement, orbit modes use panning
    if (normalizedKey === 'shift') {
      freeKeyboard.boost = true;
    }
    if (FREE_MOVE_KEYS.has(normalizedKey)) {
      freeKeyboard.activeKeys.add(normalizedKey);
      markInteraction();
      event.preventDefault();
      return;
    }
    switch (event.key) {
      case '0':
        applyViewPreset(state, 'fit');
        // When user explicitly requests fit, compute and set the scene radius
        // to ensure both height and width are visible.
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
        markInteraction();
        emitCameraState(true);
        break;
      case '1':
        applyViewPreset(state, 'top');
        markInteraction();
        emitCameraState(true);
        break;
      case '2':
        applyViewPreset(state, 'front');
        markInteraction();
        emitCameraState(true);
        break;
      case '3':
        applyViewPreset(state, 'right');
        markInteraction();
        emitCameraState(true);
        break;
      case '4':
        applyViewPreset(state, 'iso');
        markInteraction();
        emitCameraState(true);
        break;
      case ' ':
        toggleAutoRotate();
        markInteraction();
        event.preventDefault();
        break;
      default:
        break;
    }
  };
  window.addEventListener('keydown', handleKeydown);
  const handleKeyup = (event: KeyboardEvent): void => {
    const normalizedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (normalizedKey === 'shift') {
      freeKeyboard.boost = false;
    }
    if (FREE_MOVE_KEYS.has(normalizedKey)) {
      freeKeyboard.activeKeys.delete(normalizedKey);
      event.preventDefault();
    }
  };
  window.addEventListener('keyup', handleKeyup);
  const handleWindowBlur = (): void => {
    clearFreeMovementKeys();
  };
  window.addEventListener('blur', handleWindowBlur);

  const uniform = buildUniformBlock(uniformSize);
  // Typed alias used by shader-update code.
  const f32 = uniform;
  let frameCounter = 0;
  let totalDrawnVerts = 0;
  let totalDrawCalls = 0;

  const updateAndDraw = (payload?: WebGPUParams): void => {
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

      // Resolve drain radius and style id from `cfg`/`current` similar to preview module
      const height = clampNumber(cfg.H, 120.0);
      const radiusTop = clampNumber(cfg.Rt ?? cfg.Rt, 70.0);
      const radiusBottom = clampNumber(cfg.Rb ?? cfg.Rb, 45.0);
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
      const drainRadiusRaw =
        cfg.r_drain ?? cfg.drain ?? cfg.drainRadius ?? (cfg as Record<string, unknown>)?.drain_radius ?? current.r_drain;
      const drainRadius = clampNumber(drainRadiusRaw, 10.0);
      // Core geometry params - ensure WGSL receives the pot dimensions and style flags
      f32[0] = height;
      f32[1] = radiusTop;
      f32[2] = radiusBottom;
      f32[3] = clampNumber(cfg.expn, 1.0);
      f32[4] = clampNumber(cfg.spin_turns ?? cfg.turns, 0.0);
      f32[5] = clampNumber(cfg.spin_phase ?? cfg.phase, 0.0);
      f32[6] = clampNumber(cfg.spin_curve ?? cfg.curve, 1.0);
      f32[7] = styleId;
      const sf_m_base_val = cfg.sf_m_base ?? (cfg as Record<string, any>).sf_m ?? cfg.sf_m ?? 6.0;
      const sf_m_top_val = cfg.sf_m_top ?? sf_m_base_val ?? 10.0;
      f32[8] = clampNumber(sf_m_base_val, 6.0);
      f32[9] = clampNumber(sf_m_top_val, 10.0);
      f32[10] = clampNumber(cfg.sf_n1 ?? cfg.n1, 0.35);
      f32[11] = clampNumber(cfg.sf_n2 ?? cfg.n2, 0.8);
      f32[12] = clampNumber(cfg.sf_n3 ?? cfg.n3, 0.8);
      f32[DRAIN_RADIUS_OFFSET] = Math.max(Math.abs(drainRadius), 0.5);
      // Bell/bulge parameters (f32[14-15, 72]) - applies to all styles
      f32[14] = clampNumber(cfg.bellAmp, 0.0);  // Bell amplitude (-0.5 to 0.5)
      f32[15] = clampNumber(cfg.bellCenter, 0.5); // Bell center position (0.1-0.9)
      f32[BELL_WIDTH_OFFSET] = clampNumber(cfg.bellWidth, 0.22); // Bell width (0.1-1.0)
      current.r_drain = drainRadius;
      current.styleId = styleId;

      syncStyleParams(cfg.styleParams ?? current.styleParams);
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
          console.debug('[WebGPU] camera up negative — flipping roll', { up: cameraRig.basis.up, eye: cameraRig.eye });
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
            let projection: Mat4 | null = null;
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

      // If debug is active, emit lookAt basis diagnostics so we can inspect
      // whether axes are degenerating near vertical camera orientations.
      if (debugActive && lastLookAtBasis) {
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
      // Default Ambient/Diffuse set to 0.0 to avoid baked/emit-like brightness
      f32[22] = clampNumber(cfg.ambient, 0.0);
      f32[23] = clampNumber(cfg.diffuse, 0.0);
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
      const specular = Math.min(Math.max(clampNumber(cfg.specular, 0.4), 0), 1);
      const roughness = Math.min(Math.max(clampNumber(cfg.roughness, 0.45), 0.02), 1);
      f32[SPECULAR_GAIN_OFFSET] = specular;
      f32[ROUGHNESS_OFFSET] = roughness;
      // Show inner surface toggle - default to true (show inner)
      const showInner = cfg.showInner !== false;
      f32[SHOW_INNER_OFFSET] = showInner ? 1 : 0;
      for (let i = 0; i < 16; i += 1) {
        f32[VP_MATRIX_OFFSET + i] = cameraRig.viewProjection[i];
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
          emitDiagnostic('webgpu:camera-fit-ndc', { ndc: { minX, maxX, minY, maxY }, canvasId: mountCanvasId });
        } catch (err) {
          /* ignore */
        }
      }

      // Sanity check: ensure the viewProjection matrix and camera eye are finite.
      const isFiniteMat = (m: Mat4) => {
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
      current.cameraNonce = lastCameraNonce ?? undefined;
      current.scenePadding = paddingHint;
      current.projection = state.projectionMode;

      const drawVerts = resolvedCounts.totalVerts;
      const safeDrawVerts = Math.max(0, Math.min(MAX_VERTS, Math.floor(drawVerts)));
      if (!Number.isFinite(safeDrawVerts) || safeDrawVerts <= 0) {
        emitDiagnostic('webgpu:skip-draw', {
          reason: 'zero-vertices',
          desiredCounts,
          resolvedCounts,
          canvasId: mountCanvasId,
        });
        console.debug('[WebGPU:diag] skip-draw', { desiredCounts, resolvedCounts });
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
      // CRITICAL: Include t_wall (f32[25]), t_bottom (f32[26]), drain (f32[13]), bell (f32[14-15,72]) for live updates
      const geoSig = `${f32[0]}_${f32[1]}_${f32[2]}_${f32[3]}_${f32[16]}_${f32[17]}_${f32[6]}_${f32[7]}_${f32[8]}_${f32[13]}_${f32[25]}_${f32[26]}_${f32[14]}_${f32[15]}_${f32[72]}`;
      const uniformSignature = `${sigRotX}_${sigRotY}_${state.zoom ?? 1}_${state.panX ?? 0}_${state.panY ?? 0}_${state.projectionMode}_${String(state.displayCamQuat ?? state.camQuat)}_${geoSig}_${state.canvasAspect}`;
      (globalThis as any).__lastUniformSignature = (globalThis as any).__lastUniformSignature ?? null;
      const lastUniformSignature = (globalThis as any).__lastUniformSignature;
      const parityUniformPending = isUniformParityRewritePending(state);
      const shouldWriteUniforms = parityUniformPending || (uniformDirty && uniformSignature !== lastUniformSignature);
      if (shouldWriteUniforms) {
        (globalThis as any).__lastUniformSignature = uniformSignature;
        device.queue.writeBuffer(uniformBuffer, 0, uniform.buffer as ArrayBuffer);
        clearUniformParityRewriteFlag(state);
        // Emit a compact diagnostic snapshot of key uniform params for debugging
        const Hval = Number(f32[0]);
        const Rtval = Number(f32[1]);
        const Rbval = Number(f32[2]);
        // Throttle uniform debug emissions to avoid flooding diagnostics
        const __now = performance.now();
        const __lastUniform = (globalThis as any).__lastUniformEmitMs ?? 0;
        if (__now - __lastUniform > 250) {
          (globalThis as any).__lastUniformEmitMs = __now;
          emitDiagnostic('webgpu:uniform-write', {
            H: Hval,
            Rt: Rtval,
            Rb: Rbval,
            panX: state.panX,
            panY: state.panY,
            zoom: state.zoom,
            canvasId: mountCanvasId,
            ts: Date.now(),
            cameraSeq: cameraSequence,
          });
          if (debugEnabled) console.debug('[WebGPU:diag] uniforms', { H: Hval, Rt: Rtval, Rb: Rbval, panX: state.panX, panY: state.panY, zoom: state.zoom });
        }
      }

      const gradientSignature = JSON.stringify(cfg.gradient ?? null);
      if (gradientSignature !== lastGradientSignature) {
        writeGradient(device, colorBuffers, cfg.gradient);
        lastGradientSignature = gradientSignature;
      }

      const desiredAlphaMode = resolveAlphaMode((cfg as Record<string, unknown>).__pf_bg_mode);
      if (desiredAlphaMode !== currentAlphaMode) {
        currentAlphaMode = desiredAlphaMode;
        try {
          context.configure({ device, format, alphaMode: currentAlphaMode });
        } catch (cfgErr) {
          emitDiagnostic('webgpu:alpha-mode-reconfigure-failed', {
            error: cfgErr instanceof Error ? cfgErr.message : String(cfgErr),
            canvasId: mountCanvasId,
            mode: currentAlphaMode,
          });
        }
      }

      const clearTuple = parseClearColor((cfg as Record<string, unknown>).__pf_bg_rgba);
      const clearValue = { r: clearTuple[0], g: clearTuple[1], b: clearTuple[2], a: clearTuple[3] };

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
        } as GPURenderPassDescriptor;
        if (depthView) {
          (magentaPassDesc as any).depthStencilAttachment = {
            view: depthView,
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
          };
        }
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
      } as GPURenderPassDescriptor;
      if (depthView) {
        (renderPassDesc as any).depthStencilAttachment = {
          view: depthView,
          depthClearValue: 1.0,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        };
      }
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
          pipelineLabel: (pipeline as any)?.label ?? null,
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
          const mulMat4Vec4 = (m: Mat4, x: number, y: number, z: number) => {
            const cx = m[0] * x + m[4] * y + m[8] * z + m[12] * 1;
            const cy = m[1] * x + m[5] * y + m[9] * z + m[13] * 1;
            const cz = m[2] * x + m[6] * y + m[10] * z + m[14] * 1;
            const cw = m[3] * x + m[7] * y + m[11] * z + m[15] * 1;
            return { x: cx, y: cy, z: cz, w: cw };
          };
          const proj = cameraRig.viewProjection;
          const pivotZ = state.pivot?.[2] ?? 0;
          const toNDC = (world: Vec3): { inside: boolean; ndc: [number, number, number] | null } => {
            const clip = mulMat4Vec4(proj, world[0], world[1], world[2]);
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

      console.debug('[WebGPU:diag] draw-call', { drawCount: safeDrawVerts, cameraEye: cameraRig.eye, pivot: state.pivot });
      const pass = encoder.beginRenderPass(renderPassDesc);
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(safeDrawVerts);
      totalDrawCalls += 1;

      // Draw wireframe overlay in the SAME render pass if enabled
      if (showWireframe) {
        pass.setPipeline(wireframePipeline!);
        pass.setBindGroup(0, wireframeBindGroup!);
        // Each solid vertex becomes 2 wireframe verts (line endpoints)
        const wireframeVerts = safeDrawVerts * 2;
        pass.draw(wireframeVerts);
        totalDrawCalls += 1;
        console.debug('[WebGPU:diag] wireframe-draw', { wireframeVerts, solidVerts: safeDrawVerts });
      }

      pass.end();

      const commandBuffer = encoder.finish({ label: 'component:frame-command-buffer' });
      device.queue.submit([commandBuffer]);
      frameCounter += 1;
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
              const detail = typeof error === 'string' ? error : (error as any)?.message ?? 'validation error';
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

  const wheelOptions: AddEventListenerOptions = { passive: false };
  canvas.addEventListener('wheel', handleWheel, wheelOptions);
  canvas.addEventListener('dblclick', handleDoubleClick);
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
    const next = cur === 'grace' ? 'always' : cur === 'always' ? 'strict' : 'grace';
    cameraController.setHostCameraAcceptPolicy(next as any);
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
  updateAndDraw(current ?? {});

  let fpsFrames = 0;
  let fpsStart = performance.now();
  let lastFrameTime = performance.now();
  let rafHandle: number | null = null;
  let disposed = false;

  const applyParamPayload = (payload?: WebGPUParams | null): void => {
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
          const root: any = typeof window !== 'undefined' ? window : (globalThis as any);
          const dbg = mountCanvasId ? root.__pf_webgpu_mounts?.[mountCanvasId]?.debug : undefined;
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
          const currentRotZ = (state as any).displayRotZ ?? state.rotZ ?? 0;
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

    if (pendingStaticCameraEmit && isCameraStatic()) {
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
      pendingStaticCameraEmit = false;
      emitCameraState(true);
    }

    updateAndDraw(current);
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
    rafHandle = requestAnimationFrame(frame);
  };

  rafHandle = requestAnimationFrame(frame);
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
    window.removeEventListener('resize', resize);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    canvas.removeEventListener('contextmenu', preventContextMenu);
    canvas.removeEventListener('pointerdown', handlePointerDown);
    canvas.removeEventListener('pointermove', handlePointerMove);
    canvas.removeEventListener('pointerup', handlePointerRelease);
    canvas.removeEventListener('pointercancel', handlePointerRelease);
    window.removeEventListener('pointerup', handlePointerRelease);
    canvas.removeEventListener('dblclick', handleDoubleClick);
    canvas.removeEventListener('wheel', handleWheel, wheelOptions);
    if (controlsRoot) {
      controlsRoot.removeEventListener('click', handleControlsClick);
    }
    window.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('keyup', handleKeyup);
    window.removeEventListener('blur', handleWindowBlur);
    cancelCameraEmit();
    if (debugOverlayEl?.parentElement) {
      debugOverlayEl.parentElement.removeChild(debugOverlayEl);
    }
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
    if (depth) depth.destroy();
    uniformBuffer.destroy();
    colorBuffers.c1.destroy();
    colorBuffers.c2.destroy();
    colorBuffers.c3.destroy();
    styleParamBuffer.destroy();
    if (localControlResetTimer !== null) {
      window.clearTimeout(localControlResetTimer);
      localControlResetTimer = null;
    }
  };

  const controller: WebGPUController = {
    updateParams: (payload: any) => {
      applyParamPayload(payload);
    },
    handleCameraCommand: (payload: any) => {
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
  };

  return controller;
};
