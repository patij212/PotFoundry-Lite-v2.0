// Canonical types and lightweight helpers for frontend WebGPU component

/**
 * Mount configuration passed via initialParams.
 * Extends base properties with optional style and camera settings.
 */
export interface MountConfig extends Record<string, unknown> {
  /** Style ID (numeric) or style name (string) */
  style?: string | number;
  /** Numeric style ID (takes precedence over style) */
  styleId?: number;
  /** Camera acceptance policy for host-driven updates */
  hostCameraAcceptPolicy?: 'always' | 'grace' | 'strict';
  /** Grace period for local camera control (ms) */
  localCameraGraceMs?: number;
  /** Alias for localCameraGraceMs */
  hostCameraGraceMs?: number;
  /** Internal: background gradient override */
  __pf_bg_gradient?: unknown;
  /** Internal: background alpha mode */
  __pf_bg_mode?: unknown;
  /** Background gradient configuration */
  background_gradient?: unknown;
  /** Background configuration */
  background?: unknown;
  /** Gradient angle */
  gradient_angle?: number;
}

export type MountOptions = {
  canvas: HTMLCanvasElement;
  canvasId?: string;
  statusEl?: HTMLElement | null;
  controlsEl?: HTMLElement | null;
  initialParams?: Record<string, unknown> | null;
  emit?: ((e: unknown) => void) | null;
  debugMode?: boolean;
  onAutoRotateChange?: (v: boolean) => void;
};

// === WebGPU Error Codes ===
export type WebGPUErrorCode =
  | 'webgpu:not-supported'
  | 'webgpu:adapter-unavailable'
  | 'webgpu:context-unavailable'
  | 'webgpu:pipeline-failed'
  | 'webgpu:invalid-vertex-count'
  | 'webgpu:index-overflow'
  | 'component:mount-failed'
  | 'component:mount-rejected';

// === Camera Snapshot ===
export interface CameraSnapshot {
  rotX: number;
  rotY: number;
  zoom: number;
  panX: number;
  panY: number;
  autoRotate: boolean;
  sceneRadius: number;
  projection: 'perspective' | 'ortho';
  cameraMode: CameraMode;
  pivot: Vec3;
  eye: Vec3;
}

// === WebGPU Events ===
export interface WebGPUReadyEvent {
  type: 'ready';
  payload: { timestamp: number; canvasId: string | undefined };
}

export interface WebGPUDiagnosticEvent {
  type: 'diagnostic';
  payload: { message: string; detail?: Record<string, unknown>; timestamp: number; canvasId: string | undefined };
}

export interface WebGPUErrorEvent {
  type: 'error';
  payload: {
    code: WebGPUErrorCode;
    message: string;
    detail?: string;
    fatal: boolean;
    timestamp: number;
    canvasId: string | undefined;
    context: Record<string, unknown>;
  };
}

export interface WebGPUCameraStateEvent {
  type: 'cameraState';
  payload: CameraSnapshot & { timestamp: number; seq: number };
}

export type WebGPUEvent =
  | WebGPUReadyEvent
  | WebGPUDiagnosticEvent
  | WebGPUErrorEvent
  | WebGPUCameraStateEvent;

// === WebGPU Controller Interface ===
export interface WebGPUController {
  updateParams(payload?: WebGPUParams | null): void;
  handleCameraCommand(payload: unknown): void;
  setAutoRotate(value: boolean): void;
  toggleAutoRotate(): void;
  getAutoRotate(): boolean;
  setAutoPivot(value: boolean): void;
  toggleAutoPivot(): void;
  getAutoPivot(): boolean;
  dispose(): void;
  setDebugSegments(segments: Float32Array): void;
  setDebugPoints(points: Float32Array): void;
}

export const DEBUG_PARAM_FLAG = '__webgpu_debug_flag__';
export const ALWAYS_ON_DIAGNOSTICS: Set<string> = new Set([
  'webgpu:shader-compile-error',
  'webgpu:pipeline-create-error',
  'webgpu:pipeline-failed',
  'webgpu:pipeline-ready',
  'webgpu:pipeline-create-fallback',
  'webgpu:bind-group-ready',
  'webgpu:uniform-write',
  'webgpu:shader-sniff',
  'webgpu:shader-entries-missing',
  'webgpu:shader-bindings-missing',
  'webgpu:shader-import-looks-like-html',
  'webgpu:shader-import-looks-like-js-module',
  'webgpu:shader-uniform-count-mismatch',
  'webgpu:shader-vertex-builtin-missing',
  'webgpu:skip-draw',
  // Removed frustum-check and draw-call — these fire every frame and can flood host
  // 'webgpu:frustum-check',
  // 'webgpu:draw-call',
]);

export type CameraMode = 'arcball' | 'turntable' | 'free';
export const isCameraMode = (v: unknown): v is CameraMode => v === 'arcball' || v === 'turntable' || v === 'free';

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

import type { Vec3, Quaternion, CameraBasis } from './camera_basis';

export const computeSceneExtents = (cfg: Record<string, unknown>) => {
  // Extract pot dimensions from config
  const H = Math.max(Math.abs(Number(cfg?.H) || 120), 1);
  const Rt = Math.max(Math.abs(Number(cfg?.Rt) || 70), 1);
  const Rb = Math.max(Math.abs(Number(cfg?.Rb) || 45), 1);
  const halfHeight = H / 2;
  const maxRadius = Math.max(Rt, Rb);
  const paddedMax = Math.max(halfHeight, maxRadius);
  return {
    paddingHint: 0,
    paddedHalfWidth: maxRadius,
    paddedHalfHeight: halfHeight,
    paddedMax,
  };
};

export type WebGPUParams = Record<string, unknown>;

export type Ray = { origin: Vec3; dir: Vec3 };

export type CameraRig = {
  eye: Vec3;
  viewProjection: Float32Array;
  near: number;
  far: number;
  fov: number;
  mode: 'perspective' | 'ortho';
  basis: CameraBasis;
};

export interface WebGPUState {
  panX: number;
  panY: number;
  zoom: number;
  orbitZoom: number;
  autoRotate: boolean;
  autoRotateSpeed: number;      // Radians per second for autorotate
  autoRotateResumeAt: number;   // Timestamp when autorotate should resume after interaction
  cameraMode: 'turntable' | 'arcball' | 'free';
  camRight: Vec3;
  camUp: Vec3;
  camForward: Vec3;
  camQuat: Quaternion;
  displayCamRight?: Vec3 | null;
  displayCamUp?: Vec3 | null;
  displayCamForward?: Vec3 | null;
  displayCamQuat?: Quaternion | null;
  displayRotX?: number | null;
  displayRotY?: number | null;
  displayRotZ?: number | null;
  rotX: number;
  rotY: number;
  rotZ?: number;
  sceneRadius: number;
  inertiaArcAxis: Vec3 | null;
  inertiaArcSpeed: number;
  inertiaRotX: number;
  inertiaRotY: number;
  inertiaPanX: number;
  inertiaPanY: number;
  pivot: Vec3;
  targetPivot?: Vec3 | null;    // Target pivot for smooth pivot transitions
  freePosition: Vec3;
  freeSpeed: number;
  interacting: boolean;
  lastInteraction: number;
  cameraDirty?: boolean;
  projectionMode: 'perspective' | 'ortho';
  lastCameraPush: number;
  lastParamUpdate: number;
  lastParamNonce: number | null;
  recentParamUpdate: boolean;
  interactiveLodRatio: number;
  interactiveLodEnabled: boolean;
  debugOverlay: boolean;
  cameraNonce?: number | null;
  zone: Record<string, unknown> | null;
  canvasAspect?: number;
  showGrid?: boolean;
  showAxis?: boolean;
  autoPivotFromCamera?: boolean;
  disableAutoFlip?: boolean;
  /** Debug: last committed camera basis (for diagnostics) */
  recentBasisCommit?: { right: Vec3; up: Vec3; forward: Vec3 };
  /** Debug: last inertia snapshot (for diagnostics) */
  recentInertia?: {
    type: 'arc' | 'turntable';
    raw?: number;
    clamped?: number;
    axis?: Vec3 | null;
    inertiaRotX?: number;
    inertiaRotY?: number;
    displayRotX?: number | null;
    displayRotY?: number | null;
    dt?: number;
    ts: number;
  } | null;
  // allowance for additional properties used by update loops
  [key: string]: unknown;
}

export default {};
