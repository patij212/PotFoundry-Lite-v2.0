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

import potPreviewWgsl from '../../../../preview/assets/pot_preview.wgsl?raw';
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
  multiplyQuaternions,
  invertQuaternion,
  axisAngleFromQuaternion,
} from './camera_basis';

export interface WebGPUErrorPayload {
  code: string;
  message: string;
  detail?: string;
  fatal?: boolean;
  timestamp: number;
  canvasId?: string;
  context?: Record<string, unknown>;
}

export type CameraStateEvent = {
  type: 'cameraState';
  payload: CameraSnapshot & { timestamp: number; seq: number };
};
// Orbit controls helpers
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const wrapTau = (a: number) => {
  const TAU = Math.PI * 2;
  let r = a % TAU;
  if (r < 0) r += TAU;
  return r;
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
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const TURN_YAW_SENS = 2 * Math.PI;
const TURN_PITCH_SENS = Math.PI;
const FREE_LOOK_YAW_SENS = 1.8 * Math.PI;
const FREE_LOOK_PITCH_SENS = Math.PI;
const FREE_LOOK_PAN_SENS = 0.85;
const FREE_LOOK_DOLLY_SENS = 0.0025;
const FOCUS_TWEEN_MS = 260;

const clampZoomValue = (value: number): number => Math.min(4.0, Math.max(0.25, value));

const ensureInteractiveBasis = (state: WebGPUState): CameraBasis => cameraController.ensureInteractiveBasis();

const ensureFreePosition = (state: WebGPUState): Vec3 => {
  const pos = state.freePosition;
  if (Array.isArray(pos) && pos.length === 3 && pos.every((v) => Number.isFinite(v))) {
    return pos as Vec3;
  }
  const pivotZ = state.pivot?.[2] ?? 0;
  const fallback: Vec3 = [state.panX, state.panY - Math.max(state.sceneRadius * CAMERA_DISTANCE_FALLOFF, 120), pivotZ + Math.max(state.sceneRadius * 0.25, 30)];
  state.freePosition = fallback;
  return fallback;
};

const translateFreeCamera = (state: WebGPUState, delta: Vec3): void => {
  const pos = ensureFreePosition(state);
  state.freePosition = [pos[0] + delta[0], pos[1] + delta[1], pos[2] + delta[2]];
  state.cameraDirty = true;
};

const applyTurntableDrag = (
  state: WebGPUState,
  dx: number,
  dy: number,
  vw: number,
  vh: number
): void => {
  const dYaw = (-dx / Math.max(1, vw)) * TURN_YAW_SENS;
  const dPitch = (-dy / Math.max(1, vh)) * TURN_PITCH_SENS;
  const basis = ensureInteractiveBasis(state);
  const step = turntableStep(basis, dYaw, dPitch);
  state.displayCamRight = [...step.basis.right];
  state.displayCamUp = [...step.basis.up];
  state.displayCamForward = [...step.basis.forward];
  state.displayCamQuat = quaternionFromBasis(step.basis);
  state.displayRotX = step.rotX;
  state.displayRotY = wrapTau(step.rotY);
  state.cameraDirty = true;
};

// Use shared arcballDelta helper from camera_basis
const arcballDelta = (x0: number, y0: number, x1: number, y1: number, w: number, h: number, radius = 1.0) =>
  sharedArcballDelta(x0, y0, x1, y1, w, h, radius);

export type ReadyEvent = {
  type: 'ready';
  payload: { timestamp: number; canvasId?: string };
};

export type ErrorEvent = {
  type: 'error';
  payload: WebGPUErrorPayload;
};

export type DiagnosticEvent = {
  type: 'diagnostic';
  payload: { message: string; detail?: Record<string, unknown>; timestamp: number; canvasId?: string };
};

export type ParamBatchEvent = {
  type: 'paramBatchComplete';
  payload: {
    params: Record<string, unknown>;
    fields: Array<{ id: string; sessionKey: string; value: number }>;
    timestamp: number;
    commit: boolean;
  };
};

export type WebGPUEvent =
  | CameraStateEvent
  | ReadyEvent
  | ErrorEvent
  | DiagnosticEvent
  | ParamBatchEvent;

type CameraMode = 'turntable' | 'arcball' | 'free';
const CAMERA_MODES: CameraMode[] = ['turntable', 'arcball', 'free'];
const isCameraMode = (value: unknown): value is CameraMode =>
  typeof value === 'string' && (CAMERA_MODES as string[]).includes(value);

export type WebGPUEmitter = (event: WebGPUEvent) => void;

export interface MountOptions {
  canvas: HTMLCanvasElement;
  canvasId?: string;
  statusEl?: HTMLElement | null;
  controlsEl?: HTMLElement | null;
  initialParams?: WebGPUParams | null;
  emit?: WebGPUEmitter | null;
  debugMode?: boolean;
  onAutoRotateChange?: (value: boolean) => void;
}

const ALWAYS_ON_DIAGNOSTICS = new Set<string>([
  'error',
  'mount:start',
  'mount:fail',
  'component:status-ready',
  'webgpu:unsupported',
  'webgpu:adapter-null',
  'webgpu:adapter-request-error',
  'webgpu:adapter-missing',
  'webgpu:adapter-ready',
  'webgpu:device-request-failed',
  'webgpu:device-ready',
  'webgpu:context-ready',
]);

type GradientColor = [number, number, number];
type ClearColor = [number, number, number, number];

export type WebGPUParams = {
  H?: number;
  Rt?: number;
  Rb?: number;
  expn?: number;
  spin_turns?: number;
  spin_phase?: number;
  spin_curve?: number;
  styleId?: number;
  styleParams?: ArrayLike<number> | null;
  sf_m_base?: number;
  sf_m_top?: number;
  sf_n1?: number;
  sf_n2?: number;
  sf_n3?: number;
  ambient?: number;
  diffuse?: number;
  specular?: number;
  roughness?: number;
  fresnel?: number;
  t_wall?: number;
  t_bottom?: number;
  r_drain?: number;
  drain?: number;
  drainRadius?: number;
  gradient?: unknown;
  nTheta?: number;
  n_theta?: number;
  nZ?: number;
  n_z?: number;
  innerSegments?: number;
  inner_segments?: number;
  bottom_rings?: number;
  bottomRings?: number;
  rim_rings?: number;
  rimRings?: number;
  sceneRadius?: number;
  scenePadding?: number;
  interactiveLod?: number;
  interactiveLodEnabled?: boolean;
  paramUpdate?: boolean;
  paramUpdateNonce?: number;
  cameraNonce?: number;
  autoRotate?: boolean;
  rotX?: number;
  rotY?: number;
  cameraMode?: CameraMode;
  freePosition?: Vec3;
  freeSpeed?: number;
  zoom?: number;
  panX?: number;
  panY?: number;
  projection?: 'ortho' | 'perspective';
  debug?: boolean;
  __pf_bg_rgba?: unknown;
  __pf_bg_mode?: unknown;
  [key: string]: unknown;
};

type PointerMode = 'orbit' | 'pan' | 'dolly';
type FocusTween = {
  startTime: number;
  duration: number;
  startPanX: number;
  startPanY: number;
  startZoom: number;
  targetPanX: number;
  targetPanY: number;
  targetZoom: number;
};

type WebGPUState = {
  rotX: number;
  rotY: number;
  rotZ?: number;
  autoRotate: boolean;
  cameraMode: CameraMode;
  zoom: number;
  orbitZoom: number;
  panX: number;
  panY: number;
  inertiaRotX: number;
  inertiaRotY: number;
  inertiaPanX: number;
  inertiaPanY: number;
  inertiaArcAxis: Vec3 | null;
  inertiaArcSpeed: number;
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
  debugOverlay: boolean;
  showGrid?: boolean;
  camRight: Vec3;
  camUp: Vec3;
  camForward: Vec3;
  camQuat: Quaternion;
  // Transient basis used for interactive updates; null when synced with cam*.
  displayCamRight: Vec3 | null;
  displayCamUp: Vec3 | null;
  displayCamForward: Vec3 | null;
  displayCamQuat: Quaternion | null;
  displayRotX?: number | null;
  displayRotY?: number | null;
  pivot: Vec3;
  useArcball?: boolean;
  freePosition: Vec3;
  freeSpeed: number;
};

export type WebGPUController = {
  updateParams: (payload?: WebGPUParams | null) => void;
  handleCameraCommand: (payload: unknown) => void;
  setAutoRotate: (value: boolean) => void;
  toggleAutoRotate: () => void;
  getAutoRotate: () => boolean;
  dispose: () => void;
};

type GPUCompilationInfo = { messages?: GPUCompilationMessage[] } | undefined;

const WGSL_SOURCE = potPreviewWgsl;
const DEBUG_PARAM_FLAG = '__pf_wgpu_debug__';
const MAX_VERTS = 0xffffffff;
const STYLE_PARAM_CAPACITY = 48;
const DEFAULT_INTERACTIVE_LOD = 0.45;
const MIN_INTERACTIVE_LOD = 0.15;
const INTERACTIVE_THETA_RATIO_FLOOR = 0.65;
const INTERACTIVE_Z_RATIO_FLOOR = 0.4;
const MIN_THETA_STATIC = 3;
const MIN_Z_STATIC = 2;
const MIN_THETA_INTERACTIVE = 12;
const MIN_Z_INTERACTIVE = 8;
const PARAM_UPDATE_TIMEOUT_MS = 320;
const CAMERA_BROADCAST_MS = 200;
const CAMERA_EPSILON = 1e-4;
const CAMERA_STATIC_EPS = 1e-4;
const CAMERA_PADDING = 1.55;
const CAMERA_PADDING_MIN = 1.52;
const CAMERA_PADDING_MAX = 2.0;
const BASE_FOV = (50 * Math.PI) / 180;
const MIN_FOV = (20 * Math.PI) / 180;
const MAX_FOV = (75 * Math.PI) / 180;
const CAMERA_NEAR_EPS = 0.05;
const CAMERA_DISTANCE_FALLOFF = 2.2;
const UNIFORM_FLOAT_COUNT = 72;
const CAMERA_EYE_OFFSET = 36;
const CAMERA_MODE_OFFSET = 39;
const VP_MATRIX_OFFSET = 40;
const CAMERA_RIGHT_OFFSET = 56;
const CAMERA_UP_OFFSET = 60;
const CAMERA_FORWARD_OFFSET = 64;
const DRAIN_RADIUS_OFFSET = 13;
const GRID_FLAG_OFFSET = 68; // moved to accommodate camera basis vectors
const SPECULAR_GAIN_OFFSET = 69;
const ROUGHNESS_OFFSET = 70;
const INVALID_STATUS_COOLDOWN_MS = 750;
const DEFAULT_CLEAR_COLOR: ClearColor = [0.05, 0.05, 0.07, 1.0];
const BASIS_FLIP_DOT_THRESHOLD = -0.999;

type CameraSnapshot = {
  rotX: number;
  rotY: number;
  zoom: number;
  panX: number;
  panY: number;
  autoRotate: boolean;
  sceneRadius: number;
  projection: 'ortho' | 'perspective';
  cameraMode: CameraMode;
  pivot: Vec3;
  eye: Vec3;
};

type Vec3 = HelperVec3;
type Mat4 = Float32Array;

type CameraBasis = HelperCameraBasis;
type Quaternion = HelperQuaternion;

type CameraRig = {
  eye: Vec3;
  viewProjection: Mat4;
  near: number;
  far: number;
  fov: number;
  mode: 'ortho' | 'perspective';
  basis: CameraBasis;
};

type SceneExtents = {
  paddedHalfWidth: number;
  paddedHalfHeight: number;
  paddedMax: number;
  paddingHint: number;
};

const computeSceneExtents = (params: WebGPUParams): SceneExtents => {
  const height = clampNumber(params.H, 120.0);
  const radiusTop = clampNumber(params.Rt, 70.0);
  const radiusBottom = clampNumber(params.Rb, 45.0);
  const safeHeight = Math.max(Math.abs(height), 1);
  const safeRadiusTop = Math.max(Math.abs(radiusTop), 1);
  const safeRadiusBottom = Math.max(Math.abs(radiusBottom), 1);
  const paddingRaw = typeof params.scenePadding === 'number' ? clampNumber(params.scenePadding, CAMERA_PADDING) : CAMERA_PADDING;
  const paddingHint = sanitizePadding(paddingRaw);
  const halfHeight = Math.max(safeHeight * 0.5, 1);
  const outerRadius = Math.max(safeRadiusTop, safeRadiusBottom);
  const halfWidth = Math.max(outerRadius, 1);
  const paddedHalfWidth = Math.max(1, halfWidth * paddingHint);
  const paddedHalfHeight = Math.max(1, halfHeight * paddingHint);
  const paddedMax = Math.max(paddedHalfWidth, paddedHalfHeight, 1);
  return { paddedHalfWidth, paddedHalfHeight, paddedMax, paddingHint };
};

const WORLD_UP: Vec3 = [0, 0, 1];

// Debug: store the last computed lookAt basis vectors lengths so we can
// emit diagnostics when the camera approaches singular configurations.
let lastLookAtBasis: { xLen: number; yLen: number; zLen: number } | null = null;
let lastCameraRig: CameraRig | null = null;

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
  reportDiagnostic: (message: string, detail?: Record<string, unknown>) => void
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
  try {
    return await device.createRenderPipelineAsync({
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
    });
  } catch (err) {
    console.error('createRenderPipelineAsync failed', err);
    reportStatus('WebGPU • pipeline creation failed');
    reportDiagnostic('webgpu:pipeline-create-error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
};

const createDepthTexture = (device: GPUDevice, width: number, height: number): GPUTexture =>
  device.createTexture({
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
  state.camForward = [...basis.forward];
  state.camUp = [...basis.up];
  state.camRight = [...basis.right];
  state.camQuat = quaternionFromBasis(basis);
  state.rotX = wrapAngle(rotX);
  state.rotY = wrapAngle(rotY);
  state.rotZ = 0;
};

const syncAnglesFromBasis = (state: WebGPUState): void => {
  const { rotX, rotY } = cbSyncAnglesFromBasis({ forward: [...state.camForward], up: [...state.camUp], right: [...state.camRight] });
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

const resolveActiveBasis = (state: WebGPUState): CameraBasis => cameraController.resolveActiveBasis();

const commitDisplayBasisToState = (state: WebGPUState): boolean => cameraController.commitDisplayBasisToState();

const viewMatrixFromBasis = (basis: CameraBasis, eye: Vec3): Mat4 => {
  const out = new Float32Array(16);
  out[0] = basis.right[0];
  out[1] = basis.right[1];
  out[2] = basis.right[2];
  out[3] = 0;
  out[4] = basis.up[0];
  out[5] = basis.up[1];
  out[6] = basis.up[2];
  out[7] = 0;
  out[8] = basis.forward[0];
  out[9] = basis.forward[1];
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
  const out = new Float32Array(16);
  out[0] = xAxis[0];
  out[1] = xAxis[1];
  out[2] = xAxis[2];
  out[3] = 0;
  out[4] = yAxis[0];
  out[5] = yAxis[1];
  out[6] = yAxis[2];
  out[7] = 0;
  out[8] = zAxis[0];
  out[9] = zAxis[1];
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

type Ray = { origin: Vec3; dir: Vec3 };

const invertMat4 = (m: Mat4): Mat4 | null => {
  const inv = new Float32Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
  let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-8) {
    return null;
  }
  det = 1 / det;
  for (let i = 0; i < 16; i += 1) {
    inv[i] *= det;
  }
  return inv;
};

const transformClipToWorld = (inv: Mat4, x: number, y: number, z: number): Vec3 | null => {
  const cx = inv[0] * x + inv[4] * y + inv[8] * z + inv[12];
  const cy = inv[1] * x + inv[5] * y + inv[9] * z + inv[13];
  const cz = inv[2] * x + inv[6] * y + inv[10] * z + inv[14];
  const cw = inv[3] * x + inv[7] * y + inv[11] * z + inv[15];
  if (!Number.isFinite(cw) || Math.abs(cw) < 1e-6) {
    return null;
  }
  const iw = 1 / cw;
  return [cx * iw, cy * iw, cz * iw];
};

const worldRayFromCanvas = (
  rig: CameraRig,
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
): Ray | null => {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const ndcX = ((clientX - rect.left) / width) * 2 - 1;
  const ndcY = -(((clientY - rect.top) / height) * 2 - 1);
  const invVP = invertMat4(rig.viewProjection);
  if (!invVP) return null;
  const nearPoint = transformClipToWorld(invVP, ndcX, ndcY, 0);
  const farPoint = transformClipToWorld(invVP, ndcX, ndcY, 1);
  if (!nearPoint || !farPoint) {
    return null;
  }
  const dir = vec3Normalize(vec3Subtract(farPoint, nearPoint));
  return { origin: nearPoint, dir };
};

const intersectRayZPlane = (ray: Ray, z: number): Vec3 | null => {
  const EPS = 1e-6;
  if (Math.abs(ray.dir[2]) < EPS) {
    return null;
  }
  const t = (z - ray.origin[2]) / ray.dir[2];
  if (!Number.isFinite(t) || t <= 0) {
    return null;
  }
  return [ray.origin[0] + ray.dir[0] * t, ray.origin[1] + ray.dir[1] * t, z];
};

const intersectRayCylinder = (ray: Ray, radius: number, minZ: number, maxZ: number): Vec3 | null => {
  const EPS = 1e-6;
  if (radius <= EPS) {
    return null;
  }
  const dx = ray.dir[0];
  const dy = ray.dir[1];
  const ox = ray.origin[0];
  const oy = ray.origin[1];
  const a = dx * dx + dy * dy;
  if (Math.abs(a) < EPS) {
    return null;
  }
  const b = 2 * (ox * dx + oy * dy);
  const c = ox * ox + oy * oy - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return null;
  }
  const sqrtDisc = Math.sqrt(discriminant);
  const invDenom = 0.5 / a;
  const tCandidates = [(-b - sqrtDisc) * invDenom, (-b + sqrtDisc) * invDenom].filter((t) => Number.isFinite(t) && t > EPS);
  tCandidates.sort((aVal, bVal) => aVal - bVal);
  for (const t of tCandidates) {
    const z = ray.origin[2] + ray.dir[2] * t;
    if (z >= minZ - EPS && z <= maxZ + EPS) {
      return [ray.origin[0] + dx * t, ray.origin[1] + dy * t, z];
    }
  }
  return null;
};

const INTERACTION_TIMEOUT_MS = 240;
const INERTIA_DECAY = 0.92;

const computePanFactor = (state: WebGPUState, canvas: HTMLCanvasElement): number => {
  const rect = canvas.getBoundingClientRect();
  const reference = Math.max(rect.width, rect.height, 1);
  const scene = Math.max(state.sceneRadius, 1);
  const zoom = Math.max(state.zoom, 1e-3);
  return (scene / reference) * (2 / zoom);
};

const resetInertia = (state: WebGPUState): void => cameraController.resetInertia();

const applyViewPreset = (state: WebGPUState, preset: string): void => {
  switch (preset) {
    case 'top':
      applyCameraEuler(state, Math.PI / 2 - 1e-3, 0);
      break;
    case 'front':
      applyCameraEuler(state, 0, 0);
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
  state.displayCamRight = [...state.camRight];
  state.displayCamUp = [...state.camUp];
  state.displayCamForward = [...state.camForward];
  state.displayCamQuat = [...state.camQuat] as Quaternion;
  state.displayRotX = state.rotX;
  state.displayRotY = state.rotY;
  state.cameraDirty = true;
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
  let statusReady = false;
  const statusElement = statusEl ?? null;
  const debugEnabled = Boolean(debugMode || (initialParams && initialParams[DEBUG_PARAM_FLAG]));
  if (debugEnabled && initialParams && DEBUG_PARAM_FLAG in initialParams) {
    delete (initialParams as Record<string, unknown>)[DEBUG_PARAM_FLAG];
  }
  const mountCanvasId = (canvasId ?? '').trim() || undefined;

  const emitDiagnostic = (message: string, detail: Record<string, unknown> = {}): void => {
    const telemetryAllowed = debugEnabled || ALWAYS_ON_DIAGNOSTICS.has(message);
    if (!telemetryAllowed) {
      return;
    }
    if (debugEnabled) {
      if (Object.keys(detail).length) {
        console.debug('[WebGPU:diag]', message, detail);
      } else {
        console.debug('[WebGPU:diag]', message);
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
  };

  const debugLog = (message: string, detail?: Record<string, unknown>): void => {
    if (!debugEnabled) {
      return;
    }
    if (detail) {
      console.debug('[WebGPU]', message, detail);
    } else {
      console.debug('[WebGPU]', message);
    }
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
    pivot: [0, 0, 0],
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
  updateGridButton();
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

  const initialBgMode = (initialParams as Record<string, unknown>).__pf_bg_mode;
  let currentAlphaMode: 'opaque' | 'premultiplied' = resolveAlphaMode(initialBgMode);

  const resize = (): void => {
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(rect.width, 1);
    const cssHeight = Math.max(rect.height, 1);
    const nextDpr = window.devicePixelRatio || 1;
    if (Math.abs(nextDpr - devicePixelRatio) > 1e-3) {
      devicePixelRatio = nextDpr;
      if (debugEnabled) {
        emitDiagnostic('canvas:dpr-change', { dpr: devicePixelRatio });
      }
    }
    width = Math.max(1, Math.round(cssWidth * devicePixelRatio));
    height = Math.max(1, Math.round(cssHeight * devicePixelRatio));
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
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
  };

  window.addEventListener('resize', resize);
  resize();

  let debugOverlayEl: HTMLElement | null = null;
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

  const wgsl = WGSL_SOURCE;
  const shaderModule = device.createShaderModule({
    code: wgsl,
    label: 'potfoundry-webgpu',
  });

  const pipeline = await createPipeline(device, format, shaderModule, setStatus, emitDiagnostic);
  if (!pipeline) {
    emitErrorEvent({
      code: 'webgpu:pipeline-failed',
      message: 'WebGPU • pipeline creation failed',
      fatal: true,
    });
    return null;
  }
  emitDiagnostic('webgpu:pipeline-ready');

  const uniformSize = 4 * UNIFORM_FLOAT_COUNT;
  const bufferUsage = ((globalThis as Record<string, unknown>).GPUBufferUsage as
    | { UNIFORM?: number; COPY_DST?: number; STORAGE?: number }
    | undefined) ?? { UNIFORM: 0x40, COPY_DST: 0x08, STORAGE: 0x20 };
  const uniformUsage = bufferUsage.UNIFORM ?? 0x40;
  const copyDstUsage = bufferUsage.COPY_DST ?? 0x08;
  const storageUsage = bufferUsage.STORAGE ?? 0x20;

  const uniformBuffer = device.createBuffer({
    size: uniformSize,
    usage: uniformUsage | copyDstUsage,
  });

  const colorBuffers = {
    c1: device.createBuffer({ size: 16, usage: uniformUsage | copyDstUsage }),
    c2: device.createBuffer({ size: 16, usage: uniformUsage | copyDstUsage }),
    c3: device.createBuffer({ size: 16, usage: uniformUsage | copyDstUsage }),
  };

  const styleParamBuffer = device.createBuffer({
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
  let hasLocalCameraControl = false;
  let lastCameraNonce: number | null = null;
  // Focus tween now owned by the CameraController instance

  // Pointer state type used by CameraController
  type PointerState = {
    active: boolean;
    mode: PointerMode;
    lastX: number;
    lastY: number;
    arcLastX: number;
    arcLastY: number;
    arcStartX: number;
    arcStartY: number;
    arcStartQuat: Quaternion | null;
    arcPrevQuat: Quaternion | null;
    arcInertiaAxis: Vec3 | null;
    arcInertiaSpeed: number;
  };

  // CameraController encapsulates pointer and focus logic.
  class CameraController {
        zoomCameraAtCursor(clientX: number, clientY: number, factor: number): void {
          if (!Number.isFinite(factor) || factor <= 0) {
            return;
          }
          if (this.state.cameraMode === 'free') {
            const magnitude = Math.log(factor || 1) * 320;
            applyFreeLookDolly(magnitude);
            return;
          }
          const nextZoom = clampZoomValue(this.state.zoom * factor);
          if (Math.abs(nextZoom - this.state.zoom) < 1e-6) {
            return;
          }
          const { extents, rig } = resolveInteractionRig();
          const rayBefore = worldRayFromCanvas(rig, this.canvas, clientX, clientY);
          const pivotZ = this.state.pivot?.[2] ?? 0;
          const anchor = rayBefore ? intersectRayZPlane(rayBefore, pivotZ) : null;
          this.state.zoom = nextZoom;
          if (anchor) {
            const rigAfter = buildCameraRig(this.state, extents.paddingHint, extents.paddedHalfWidth, extents.paddedHalfHeight);
            const rayAfter = worldRayFromCanvas(rigAfter, this.canvas, clientX, clientY);
            if (rayAfter) {
              const projected = intersectRayZPlane(rayAfter, pivotZ);
              if (projected) {
                this.state.panX += anchor[0] - projected[0];
                this.state.panY += anchor[1] - projected[1];
                updatePivotFromPan();
              }
            }
          }
          this.state.cameraDirty = true;
        }
    state: WebGPUState;
    pointer: PointerState;
    canvas: HTMLCanvasElement;
    focusTween: FocusTween | null;
    constructor(state: WebGPUState, pointer: PointerState, canvas: HTMLCanvasElement) {
      this.state = state;
      this.pointer = pointer;
      this.canvas = canvas;
      this.focusTween = null;
    }
    // Ensure interactive basis (used by many helper methods)
    ensureInteractiveBasis(): CameraBasis {
      return {
        right: this.state.displayCamRight ?? this.state.camRight,
        up: this.state.displayCamUp ?? this.state.camUp,
        forward: this.state.displayCamForward ?? this.state.camForward,
      } as CameraBasis;
    }
    resolveActiveBasis(): CameraBasis {
      const hasDisplay = Boolean(
        this.state.displayCamForward && this.state.displayCamUp && this.state.displayCamRight
      );
      const sourceBasis: CameraBasis = hasDisplay
        ? {
            right: [...(this.state.displayCamRight as Vec3)],
            up: [...(this.state.displayCamUp as Vec3)],
            forward: [...(this.state.displayCamForward as Vec3)],
          }
        : {
            right: [...this.state.camRight],
            up: [...this.state.camUp],
            forward: [...this.state.camForward],
          };
      const normalized = normalizeCameraBasis(sourceBasis);
      if (hasDisplay) {
        this.state.displayCamRight = [...normalized.right];
        this.state.displayCamUp = [...normalized.up];
        this.state.displayCamForward = [...normalized.forward];
        this.state.displayCamQuat = quaternionFromBasis(normalized);
        const nextAngles = cbSyncAnglesFromBasis(normalized);
        this.state.displayRotX = nextAngles.rotX;
        this.state.displayRotY = nextAngles.rotY;
      } else {
        this.state.camRight = [...normalized.right];
        this.state.camUp = [...normalized.up];
        this.state.camForward = [...normalized.forward];
        this.state.camQuat = quaternionFromBasis(normalized);
        syncAnglesFromBasis(this.state);
      }
      return normalized;
    }
    commitDisplayBasisToState(): boolean {
      if (!this.state.displayCamForward || !this.state.displayCamUp || !this.state.displayCamRight) return false;
      try {
        console.debug('[WebGPU] commitDisplayBasisToState', {
          interacting: this.state.interacting,
          autoRotate: this.state.autoRotate,
          inertiaRotX: this.state.inertiaRotX,
          inertiaRotY: this.state.inertiaRotY,
          panX: this.state.panX,
          panY: this.state.panY,
          camForwardLen: vec3Length(this.state.displayCamForward),
          camRightLen: vec3Length(this.state.displayCamRight),
          camUpLen: vec3Length(this.state.displayCamUp),
          canvasAspect: this.state.canvasAspect,
        });
      } catch (err) {
        /* ignore */
      }
      const prevRight = this.state.camRight;
      let flipped = false;
      if (prevRight && this.state.displayCamRight) {
        const dot = vec3Dot(prevRight, this.state.displayCamRight);
        if (dot < BASIS_FLIP_DOT_THRESHOLD) {
          this.state.displayCamRight = vec3Scale(this.state.displayCamRight, -1);
          this.state.displayCamUp = vec3Scale(this.state.displayCamUp, -1);
          flipped = true;
        }
      }
      const committedBasis: CameraBasis = {
        right: [...this.state.displayCamRight],
        up: [...this.state.displayCamUp],
        forward: [...this.state.displayCamForward],
      } as CameraBasis;
      this.state.camForward = [...committedBasis.forward];
      this.state.camUp = [...committedBasis.up];
      this.state.camRight = [...committedBasis.right];
      this.state.camQuat = this.state.displayCamQuat ?? quaternionFromBasis(committedBasis);
      syncAnglesFromBasis(this.state);
      this.state.displayCamForward = null;
      this.state.displayCamUp = null;
      this.state.displayCamRight = null;
      this.state.displayCamQuat = null;
      this.state.displayRotX = null;
      this.state.displayRotY = null;
      return flipped;
    }
    updatePivotFromPan() {
      const pivotZ = this.state.pivot?.[2] ?? 0;
      this.state.pivot = [this.state.panX, this.state.panY, pivotZ];
    }
    resetInertia(): void {
      this.state.inertiaRotX = 0;
      this.state.inertiaRotY = 0;
      this.state.inertiaPanX = 0;
      this.state.inertiaPanY = 0;
      this.state.inertiaArcAxis = null;
      this.state.inertiaArcSpeed = 0;
    }
    computePanFactor(canvasEl: HTMLCanvasElement): number {
      const rect = canvasEl.getBoundingClientRect();
      const reference = Math.max(rect.width, rect.height, 1);
      const scene = Math.max(this.state.sceneRadius, 1);
      const zoom = Math.max(this.state.zoom, 1e-3);
      return (scene / reference) * (2 / zoom);
    }
    cancelFocusTween() {
      if (this.focusTween) {
        this.focusTween = null;
      }
    }
    startFocusTween(targetPanX: number, targetPanY: number, targetZoom: number, hitDepth?: number) {
      let adjustedZoom = targetZoom;
      if (hitDepth !== undefined && Number.isFinite(hitDepth)) {
        const { extents } = resolveInteractionRig();
        const paddedMax = extents.paddedMax;
        const CAMERA_DISTANCE_FALLOFF = 2.2;
        const minZoom = 0.25;
        const maxZoom = 4.0;
        const zoomFromDepth = Math.max(minZoom, Math.min(maxZoom, paddedMax * CAMERA_DISTANCE_FALLOFF / Math.max(hitDepth, 1e-3)));
        adjustedZoom = zoomFromDepth;
      }
      this.focusTween = {
        startTime: performance.now(),
        duration: FOCUS_TWEEN_MS,
        startPanX: this.state.panX,
        startPanY: this.state.panY,
        startZoom: this.state.zoom,
        targetPanX,
        targetPanY,
        targetZoom: adjustedZoom,
      };
    }
    focusCameraAtCursor(clientX: number, clientY: number) {
      const hit = (() => {
        const { rig, extents } = resolveInteractionRig();
        const ray = worldRayFromCanvas(rig, this.canvas, clientX, clientY);
        if (!ray) return null;
        const pivotZ = this.state.pivot?.[2] ?? 0;
        const cylinderHit = intersectRayCylinder(ray, extents.paddedHalfWidth, -extents.paddedHalfHeight, extents.paddedHalfHeight);
        return cylinderHit ?? intersectRayZPlane(ray, pivotZ);
      })();
      if (!hit) return;
      let suppressFocusCancel = false;
      if (this.state.cameraMode === 'free') {
        this.state.freePosition = [hit[0], hit[1], hit[2] + Math.max(this.state.sceneRadius * 0.35, 30)];
        const lookDir = vec3Normalize(vec3Subtract(hit, this.state.freePosition));
        const newBasis = buildCameraBasis(lookDir);
        this.state.displayCamRight = [...newBasis.right];
        this.state.displayCamUp = [...newBasis.up];
        this.state.displayCamForward = [...newBasis.forward];
        this.state.displayCamQuat = quaternionFromBasis(newBasis);
        const angles = cbSyncAnglesFromBasis(newBasis);
        this.state.displayRotX = angles.rotX;
        this.state.displayRotY = angles.rotY;
      } else {
        this.cancelFocusTween();
        const targetZoom = clampZoomValue(this.state.zoom);
        this.startFocusTween(hit[0], hit[1], targetZoom, hit[2]);
        suppressFocusCancel = true;
      }
      this.state.cameraDirty = true;
      this.markInteraction(!suppressFocusCancel);
      requestCameraEmitWhenStatic();
    }
    markInteraction(shouldCancelFocus = true) {
      if (shouldCancelFocus) this.cancelFocusTween();
      this.state.interacting = true;
      this.state.lastInteraction = performance.now();
      hasLocalCameraControl = true;
      this.state.cameraDirty = true;
    }
    // Pointer handlers
    releasePointer() {
      const arcballDrag = this.pointer.mode === 'orbit' && this.state.cameraMode === 'arcball';
      if (arcballDrag && this.pointer.arcInertiaAxis && Math.abs(this.pointer.arcInertiaSpeed) > 1e-5) {
        this.state.inertiaArcAxis = [
          this.pointer.arcInertiaAxis[0],
          this.pointer.arcInertiaAxis[1],
          this.pointer.arcInertiaAxis[2],
        ];
        this.state.inertiaArcSpeed = this.pointer.arcInertiaSpeed * 0.35;
      } else if (arcballDrag) {
        this.state.inertiaArcAxis = null;
        this.state.inertiaArcSpeed = 0;
      }
      if (!arcballDrag) {
        this.state.inertiaArcAxis = null;
        this.state.inertiaArcSpeed = 0;
      }
      this.pointer.active = false;
      this.pointer.arcStartQuat = null;
      this.pointer.arcPrevQuat = null;
      this.pointer.arcInertiaAxis = null;
      this.pointer.arcInertiaSpeed = 0;
    }
    onPointerDown(event: PointerEvent) {
      cancelCameraEmit();
      this.pointer.active = true;
      let mode: PointerMode = 'orbit';
      if (event.button === 2) {
        mode = 'dolly';
      } else if (event.button === 1 || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) {
        mode = 'pan';
      }
      this.pointer.mode = mode;
      this.pointer.lastX = event.clientX;
      this.pointer.lastY = event.clientY;
      setAutoRotate(false, false);
      this.markInteraction();
      // Initialize transient display basis from the committed camera basis
      this.state.displayCamRight = [...this.state.camRight];
      this.state.displayCamUp = [...this.state.camUp];
      this.state.displayCamForward = [...this.state.camForward];
      this.state.displayCamQuat = [...this.state.camQuat] as Quaternion;
      this.state.displayRotX = this.state.rotX;
      this.state.displayRotY = this.state.rotY;
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch (err) {
        console.warn('setPointerCapture', err);
      }
      // init arcball tracking
      this.pointer.arcLastX = event.clientX;
      this.pointer.arcLastY = event.clientY;
      this.pointer.arcStartX = event.clientX;
      this.pointer.arcStartY = event.clientY;
      this.pointer.arcStartQuat = this.state.cameraMode === 'arcball'
        ? (this.state.displayCamQuat ?? this.state.camQuat ?? quaternionFromBasis(ensureInteractiveBasis(this.state)))
        : null;
      this.pointer.arcPrevQuat = this.pointer.arcStartQuat;
      this.pointer.arcInertiaAxis = null;
      this.pointer.arcInertiaSpeed = 0;
      this.state.inertiaArcAxis = null;
      this.state.inertiaArcSpeed = 0;
    }
    onPointerRelease(): void {
      this.releasePointer();
      this.markInteraction();
      requestCameraEmitWhenStatic();
    }
    onPointerMove(event: PointerEvent): void {
      if (!this.pointer.active) {
        return;
      }
      const dx = event.clientX - this.pointer.lastX;
      const dy = event.clientY - this.pointer.lastY;
      this.pointer.lastX = event.clientX;
      this.pointer.lastY = event.clientY;
      if (this.pointer.mode === 'orbit') {
        const mode = this.state.cameraMode;
        if (mode === 'free') {
          if (event.shiftKey) {
            applyFreeLookPan(dx, dy);
          } else {
            applyFreeLookRotation(dx, dy);
          }
        } else if (event.shiftKey) {
          this.pointer.arcInertiaAxis = null;
          this.pointer.arcInertiaSpeed = 0;
          this.pointer.arcPrevQuat = null;
          const factor = computePanFactor(this.state, this.canvas);
          this.state.panX += dx * factor;
          this.state.panY -= dy * factor;
          this.state.inertiaPanX = dx * factor * 0.45;
          this.state.inertiaPanY = -dy * factor * 0.45;
          updatePivotFromPan();
          this.state.cameraDirty = true;
        } else if (this.state.cameraMode === 'arcball') {
          const vw = this.canvas.clientWidth || Math.max(1, this.canvas.width || 1);
          const vh = this.canvas.clientHeight || Math.max(1, this.canvas.height || 1);
          const anchorX = this.pointer.arcStartX;
          const anchorY = this.pointer.arcStartY;
          const currentX = event.clientX;
          const currentY = event.clientY;
          this.pointer.arcLastX = currentX;
          this.pointer.arcLastY = currentY;
          const { axis: arcAxisCam, angle: arcAngle } = arcballDelta(anchorX, anchorY, currentX, currentY, vw, vh);
          const baseQuat = this.pointer.arcStartQuat ?? quaternionFromBasis(ensureInteractiveBasis(this.state));
          const startBasis = basisFromQuaternion(baseQuat);
          const axisWorld = cbCameraAxisToWorld(startBasis, arcAxisCam);
          const deltaQuat = Math.abs(arcAngle) > 1e-6 ? quaternionFromAxisAngle(axisWorld, arcAngle) : null;
          const nextQuat = deltaQuat ? multiplyQuaternions(deltaQuat, baseQuat) : baseQuat;
          const rotated = basisFromQuaternion(nextQuat);
          this.state.displayCamRight = [...rotated.right];
          this.state.displayCamUp = [...rotated.up];
          this.state.displayCamForward = [...rotated.forward];
          this.state.displayCamQuat = [...nextQuat] as Quaternion;
          const { rotX, rotY } = cbSyncAnglesFromBasis({ right: rotated.right, up: rotated.up, forward: rotated.forward } as HelperCameraBasis);
          this.state.displayRotX = rotX;
          this.state.displayRotY = rotY;
          if (this.pointer.arcPrevQuat) {
            const prevQuat = this.pointer.arcPrevQuat;
            const deltaFrame = multiplyQuaternions(nextQuat, invertQuaternion(prevQuat));
            const { axis: inertiaAxis, angle: inertiaAngle } = axisAngleFromQuaternion(deltaFrame);
            if (inertiaAngle > 1e-5) {
              this.pointer.arcInertiaAxis = inertiaAxis;
              this.pointer.arcInertiaSpeed = inertiaAngle;
            } else {
              this.pointer.arcInertiaAxis = null;
              this.pointer.arcInertiaSpeed = 0;
            }
          }
          this.pointer.arcPrevQuat = [...nextQuat] as Quaternion;
          this.state.cameraDirty = true;
        } else {
          this.pointer.arcInertiaAxis = null;
          this.pointer.arcInertiaSpeed = 0;
          this.pointer.arcPrevQuat = null;
          const vw = this.canvas.clientWidth || Math.max(1, this.canvas.width || 1);
          const vh = this.canvas.clientHeight || Math.max(1, this.canvas.height || 1);
          applyTurntableDrag(this.state, dx, dy, vw, vh);
          const yawInertia = (this.state.displayRotY as number) - (this.state.rotY || 0);
          const pitchInertia = (this.state.displayRotX as number) - (this.state.rotX || 0);
          this.state.inertiaRotY = yawInertia * 0.35;
          this.state.inertiaRotX = pitchInertia * 0.35;
        }
      } else if (this.pointer.mode === 'pan') {
        if (this.state.cameraMode === 'free') {
          applyFreeLookPan(dx, dy);
        } else {
          const factor = computePanFactor(this.state, this.canvas);
          this.state.panX += dx * factor;
          this.state.panY -= dy * factor;
          this.state.inertiaPanX = dx * factor * 0.45;
          this.state.inertiaPanY = -dy * factor * 0.45;
          updatePivotFromPan();
          this.state.cameraDirty = true;
        }
      } else if (this.pointer.mode === 'dolly') {
        if (this.state.cameraMode === 'free') {
          applyFreeLookDolly(-dy);
        } else {
          const factor = Math.exp(-dy * 0.003);
          this.zoomCameraAtCursor(event.clientX, event.clientY, factor);
          this.state.inertiaRotX = 0;
          this.state.inertiaRotY = 0;
        }
      }
      this.markInteraction();
      requestCameraEmitWhenStatic();
    }
  }

  const pointer: PointerState = {
    active: false,
    mode: 'orbit' as PointerMode,
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
  let cameraController: CameraController;
  cameraController = new CameraController(state, pointer, canvas);

  const cancelFocusTween = (): void => cameraController.cancelFocusTween();

  const startFocusTween = (targetPanX: number, targetPanY: number, targetZoom: number, hitDepth?: number): void =>
    cameraController.startFocusTween(targetPanX, targetPanY, targetZoom, hitDepth);

  const FREE_MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'r', 'f']);
  const freeKeyboard = {
    activeKeys: new Set<string>(),
    boost: false,
  };
  const clearFreeMovementKeys = (): void => {
    freeKeyboard.activeKeys.clear();
    freeKeyboard.boost = false;
  };

  const applyFreeLookRotation = (dx: number, dy: number): void => {
    const vw = canvas.clientWidth || Math.max(1, canvas.width || 1);
    const vh = canvas.clientHeight || Math.max(1, canvas.height || 1);
    const basis = ensureInteractiveBasis(state);
    const yawDelta = (-dx / Math.max(1, vw)) * FREE_LOOK_YAW_SENS;
    const pitchDelta = (-dy / Math.max(1, vh)) * FREE_LOOK_PITCH_SENS;
    let rotated = rotateBasisAboutAxisFull(basis, basis.up, yawDelta) ?? basis;
    rotated = rotateBasisAboutAxisFull(rotated, rotated.right, pitchDelta) ?? rotated;
    const angles = cbSyncAnglesFromBasis(rotated);
    let rotX = angles.rotX;
    if (rotX > PITCH_SOFT_LIMIT) {
      const correction = rotX - PITCH_SOFT_LIMIT;
      rotated = rotateBasisAboutAxisFull(rotated, rotated.right, -correction) ?? rotated;
      rotX = PITCH_SOFT_LIMIT;
    } else if (rotX < -PITCH_SOFT_LIMIT) {
      const correction = rotX + PITCH_SOFT_LIMIT;
      rotated = rotateBasisAboutAxisFull(rotated, rotated.right, -correction) ?? rotated;
      rotX = -PITCH_SOFT_LIMIT;
    }
    state.displayCamRight = [...rotated.right];
    state.displayCamUp = [...rotated.up];
    state.displayCamForward = [...rotated.forward];
    state.displayCamQuat = quaternionFromBasis(rotated);
    state.displayRotX = rotX;
    state.displayRotY = angles.rotY;
    state.cameraDirty = true;
  };

  const applyFreeLookPan = (dx: number, dy: number): void => {
    const factor = computePanFactor(state, canvas) * state.freeSpeed * FREE_LOOK_PAN_SENS;
    const basis = ensureInteractiveBasis(state);
    const deltaRight = vec3Scale(basis.right, -dx * factor);
    const deltaUp = vec3Scale(basis.up, dy * factor);
    translateFreeCamera(state, vec3Add(deltaRight, deltaUp));
  };

  const applyFreeLookDolly = (delta: number): void => {
    const basis = ensureInteractiveBasis(state);
    const move = vec3Scale(basis.forward, delta * state.sceneRadius * FREE_LOOK_DOLLY_SENS);
    translateFreeCamera(state, move);
  };

  const applyFreeKeyboardInput = (deltaMs: number): boolean => {
    if (state.cameraMode !== 'free' || freeKeyboard.activeKeys.size === 0) {
      return false;
    }
    const seconds = Math.max(0, Math.min(deltaMs, 48)) / 1000;
    if (seconds <= 0) {
      return false;
    }
    const basis = ensureInteractiveBasis(state);
    let direction: Vec3 = [0, 0, 0];
    const addDir = (vec: Vec3, scale = 1): void => {
      direction = vec3Add(direction, vec3Scale(vec, scale));
    };
    if (freeKeyboard.activeKeys.has('w')) addDir(basis.forward);
    if (freeKeyboard.activeKeys.has('s')) addDir(basis.forward, -1);
    if (freeKeyboard.activeKeys.has('d')) addDir(basis.right);
    if (freeKeyboard.activeKeys.has('a')) addDir(basis.right, -1);
    if (freeKeyboard.activeKeys.has('e') || freeKeyboard.activeKeys.has('r')) addDir(basis.up);
    if (freeKeyboard.activeKeys.has('q') || freeKeyboard.activeKeys.has('f')) addDir(basis.up, -1);
    if (vec3Length(direction) < 1e-6) {
      return false;
    }
    const normalized = vec3Normalize(direction);
    const boost = freeKeyboard.boost ? 2.25 : 1.0;
    const distance = state.sceneRadius * 0.65 * state.freeSpeed * boost * seconds;
    if (!Number.isFinite(distance) || distance <= 0) {
      return false;
    }
    translateFreeCamera(state, vec3Scale(normalized, distance));
    return true;
  };

  const updatePivotFromPan = (): void => cameraController.updatePivotFromPan();

  const getMergedParams = (): WebGPUParams => {
    const merged: WebGPUParams = { ...(initialParams as WebGPUParams) };
    if (current) {
      Object.assign(merged, current);
    }
    return merged;
  };

  const resolveInteractionRig = () => {
    const cfg = getMergedParams();
    const extents = computeSceneExtents(cfg);
    const rig = buildCameraRig(state, extents.paddingHint, extents.paddedHalfWidth, extents.paddedHalfHeight);
    return { cfg, extents, rig };
  };

  const zoomCameraAtCursor = (clientX: number, clientY: number, factor: number): void => cameraController.zoomCameraAtCursor(clientX, clientY, factor);

  const focusCameraAtCursor = (clientX: number, clientY: number): void => {
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

  const markInteraction = (shouldCancelFocus = true): void => cameraController.markInteraction(shouldCancelFocus);

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
    if (!payload) {
      return;
    }
    const allowCamera = force || !hasLocalCameraControl;
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
            const currentRig = buildCameraRig(state, paddingHint, paddedHalfWidth, paddedHalfHeight);
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
                  const rigCheck = buildCameraRig(state, paddingHint, paddedHalfWidth, paddedHalfHeight);
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

    if (cameraMutated) {
      markInteraction();
    }
  };

  const releasePointer = (): void => cameraController.releasePointer();

  const preventContextMenu = (event: Event): void => {
    event.preventDefault();
  };
  canvas.addEventListener('contextmenu', preventContextMenu);

  const handlePointerDown = (event: PointerEvent): void => cameraController.onPointerDown(event);
  canvas.addEventListener('pointerdown', handlePointerDown);

  const handlePointerRelease = (): void => cameraController.onPointerRelease();

  canvas.addEventListener('pointerup', handlePointerRelease);
  canvas.addEventListener('pointercancel', handlePointerRelease);
  window.addEventListener('pointerup', handlePointerRelease);

  const handlePointerMove = (event: PointerEvent): void => cameraController.onPointerMove(event);
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
      const currentRig = buildCameraRig(state, paddingHint, paddedHalfWidth, paddedHalfHeight);
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
            const rigCheck = buildCameraRig(state, paddingHint, paddedHalfWidth, paddedHalfHeight);
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
    if (state.cameraMode === 'free') {
      if (normalizedKey === 'shift') {
        freeKeyboard.boost = true;
      }
      if (FREE_MOVE_KEYS.has(normalizedKey)) {
        freeKeyboard.activeKeys.add(normalizedKey);
        markInteraction();
        event.preventDefault();
        return;
      }
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
    if (state.interacting && now - state.lastInteraction > INTERACTION_TIMEOUT_MS) {
      state.interacting = false;
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

    const rawCameraNonce = typeof cfg.cameraNonce === 'number' ? cfg.cameraNonce : null;
    const forceCamera = rawCameraNonce !== null && rawCameraNonce !== lastCameraNonce;
    if (forceCamera) {
      lastCameraNonce = rawCameraNonce;
    }
    applyCameraPayload(cfg, forceCamera);

    const drainRadius = clampNumber(drainRadiusRaw, 10.0);
    f32[DRAIN_RADIUS_OFFSET] = Math.max(Math.abs(drainRadius), 0.5);
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
      const cameraRig = buildCameraRig(state, paddingHint, paddedHalfWidth, paddedHalfHeight);
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
    const lodActive = state.interactiveLodEnabled && state.recentParamUpdate;
    const lodScale = lodActive ? state.interactiveLodRatio : 1.0;
    const thetaRatio = lodActive ? Math.max(lodScale, INTERACTIVE_THETA_RATIO_FLOOR) : 1.0;
    const zRatio = lodActive ? Math.max(lodScale, INTERACTIVE_Z_RATIO_FLOOR) : 1.0;

    const thetaFloor = lodActive
      ? Math.min(
          baseNTheta,
          Math.max(MIN_THETA_INTERACTIVE, Math.round(baseNTheta * INTERACTIVE_THETA_RATIO_FLOOR))
        )
      : MIN_THETA_STATIC;
    const zFloor = lodActive
      ? Math.min(
          baseNZ,
          Math.max(MIN_Z_INTERACTIVE, Math.round(baseNZ * INTERACTIVE_Z_RATIO_FLOOR))
        )
      : MIN_Z_STATIC;

    const nTheta = Math.max(thetaFloor, Math.round(baseNTheta * thetaRatio));
    const nZ = Math.max(zFloor, Math.round(baseNZ * zRatio));
    const innerSegFloor = lodActive
      ? Math.min(baseInner, Math.max(1, Math.round(baseInner * 0.5)))
      : 1;
    const innerSeg = Math.max(innerSegFloor, Math.round(baseInner * zRatio));
    const bottomRings = Math.max(2, Math.min(24, Math.round(baseBottom * zRatio)));
    const rimRings = Math.max(1, Math.min(8, Math.round(baseRim * zRatio)));

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
      const rebuilt = buildCameraRig(state, paddingHint);
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
            eye: cameraRig.eye.map((v) => Number(v.toFixed(2))),
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
    const totalCells =
      cellsOuter + cellsInner + cellsBottomTop + cellsBottomUnder + cellsRim;
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
      return;
    }

    const uniformDirty =
      state.cameraDirty ||
      state.recentParamUpdate ||
      state.interacting ||
      hadPayload ||
      lodActive;
    if (uniformDirty) {
      device.queue.writeBuffer(uniformBuffer, 0, uniform.buffer as ArrayBuffer);
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

    const encoder = device.createCommandEncoder();
    let textureView: GPUTextureView | null = null;
    try {
      textureView = context.getCurrentTexture().createView();
    } catch (err) {
      emitDiagnostic('webgpu:get-current-texture-failed', {
        error: err instanceof Error ? err.message : String(err),
        canvasId: mountCanvasId,
      });
      try {
        context.configure({ device, format, alphaMode: currentAlphaMode });
        textureView = context.getCurrentTexture().createView();
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
    const depthView = depth.createView();

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
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView!,
            clearValue: { r: 1.0, g: 0.0, b: 1.0, a: 1.0 },
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
      });
      pass.end();
      device.queue.submit([encoder.finish()]);
      return;
    }

    validationFrameCounter += 1;
    const shouldValidate = debugActive || debugEnabled || validationFrameCounter % 60 === 0;
    if (shouldValidate) {
      device.pushErrorScope('validation');
    }
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue,
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
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(safeDrawVerts);
    pass.end();

    device.queue.submit([encoder.finish()]);

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

  const wheelOptions: AddEventListenerOptions = { passive: false };
  canvas.addEventListener('wheel', handleWheel, wheelOptions);
  canvas.addEventListener('dblclick', handleDoubleClick);

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
        state.sceneRadius = nextRadius;
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
    if (state.interacting && now - state.lastInteraction > INTERACTION_TIMEOUT_MS) {
      state.interacting = false;
    }

    let cameraMutated = false;
    if (cameraController.focusTween) {
      const elapsed = now - cameraController.focusTween.startTime;
      const t = Math.min(1, Math.max(0, elapsed / Math.max(1, cameraController.focusTween.duration)));
      const eased = easeOutCubic(t);
      state.panX = lerp(cameraController.focusTween.startPanX, cameraController.focusTween.targetPanX, eased);
      state.panY = lerp(cameraController.focusTween.startPanY, cameraController.focusTween.targetPanY, eased);
      state.zoom = clampZoomValue(
        lerp(cameraController.focusTween.startZoom, cameraController.focusTween.targetZoom, eased)
      );
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
        Math.abs(state.inertiaArcSpeed) > 1e-4
      ) {
        const baseQuat = (state.displayCamQuat ?? state.camQuat) as Quaternion;
        const deltaQuat = quaternionFromAxisAngle(state.inertiaArcAxis, state.inertiaArcSpeed);
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
        state.inertiaArcSpeed *= INERTIA_DECAY;
        if (Math.abs(state.inertiaArcSpeed) < 1e-4) {
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
        // Apply angular inertia directly to display angles and rebuild basis
        state.displayRotY = wrapTau((state.displayRotY as number) + state.inertiaRotY);
        const pitchLimit = Math.PI * 0.5 - 0.009;
        state.displayRotX = clamp((state.displayRotX as number) + state.inertiaRotX, -pitchLimit, pitchLimit);
        const inertiaBasis = applyCameraEulerToBasis(state.displayRotX as number, state.displayRotY as number);
        state.displayCamRight = [...inertiaBasis.right];
        state.displayCamUp = [...inertiaBasis.up];
        state.displayCamForward = [...inertiaBasis.forward];
        state.inertiaRotY *= INERTIA_DECAY;
        state.inertiaRotX *= INERTIA_DECAY;
        if (Math.abs(state.inertiaRotY) < 1e-6) {
          state.inertiaRotY = 0;
        }
        if (Math.abs(state.inertiaRotX) < 1e-6) {
          state.inertiaRotX = 0;
        }
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
      // Autorotate should mutate the transient display basis instead of
      // committing persistent camera axes directly.
      if (state.displayRotX === null || state.displayRotY === null) {
        state.displayRotX = state.rotX;
        state.displayRotY = state.rotY;
      }
      // Rotate yaw angle in small increments
      state.displayRotY = wrapTau((state.displayRotY as number) + 0.01);
      const autoBasis = applyCameraEulerToBasis(state.displayRotX as number, state.displayRotY as number);
      state.displayCamRight = autoBasis.right;
      state.displayCamUp = autoBasis.up;
      state.displayCamForward = autoBasis.forward;
      cameraMutated = true;
    }

    if (cameraMutated) {
      state.cameraDirty = true;
      if (!state.autoRotate) {
        requestCameraEmitWhenStatic();
      }
    }

    if (pendingStaticCameraEmit && isCameraStatic()) {
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
    depth.destroy();
    uniformBuffer.destroy();
    colorBuffers.c1.destroy();
    colorBuffers.c2.destroy();
    colorBuffers.c3.destroy();
    styleParamBuffer.destroy();
  };

  const controller: WebGPUController = {
    updateParams: (payload) => {
      applyParamPayload(payload);
    },
    handleCameraCommand: (payload) => {
      handleCameraCommand(payload);
    },
    setAutoRotate: (value: boolean) => {
      setAutoRotate(value, true);
    },
    toggleAutoRotate: () => {
      toggleAutoRotate();
    },
    getAutoRotate: () => state.autoRotate,
    dispose,
  };

  return controller;
};
