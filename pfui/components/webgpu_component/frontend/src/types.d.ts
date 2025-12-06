declare module '*.wgsl?raw' {
  const source: string;
  export default source;
}

// Canonical type declarations to complement `types.ts` module.
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
export const DEBUG_PARAM_FLAG: string;
export const ALWAYS_ON_DIAGNOSTICS: Set<string>;

export type CameraMode = 'arcball' | 'turntable' | 'free';
export function isCameraMode(v: unknown): v is CameraMode;
export function lerp(a: number, b: number, t: number): number;
export function easeOutCubic(t: number): number;
export function clamp(v: number, lo: number, hi: number): number;
export function computeSceneExtents(cfg: any): { paddingHint: number; paddedHalfWidth: number; paddedHalfHeight: number; paddedMax: number };
