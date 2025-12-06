// Canonical types and lightweight helpers for frontend WebGPU component
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

export type WebGPUController = any;
export type WebGPUEvent = any;
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

export const computeSceneExtents = (cfg: any) => {
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
  // allowance for additional properties used by update loops
  [key: string]: unknown;
}

export default {};
