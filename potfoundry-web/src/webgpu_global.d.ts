/**
 * @fileoverview Global type augmentations for PotFoundry debug hooks.
 *
 * These properties are attached to window/globalThis for external tooling
 * and test introspection. Consolidated from camera_controller.ts and
 * webgpu_core.ts to provide a single source of truth.
 *
 * @module webgpu_global
 */

import type { CameraController } from './camera_controller';

/** Debug metrics tracked per mount */
export interface PfMountDebugMetrics {
  uniformWrites: number;
  rigRebuilds: number;
  styleParamWrites: number;
  colorWrites: number;
}

/** Per-mount debug state */
export interface PfMountDebug {
  ready: boolean;
  usedFallback: boolean;
  lastApplyCameraPayload: { fields: string[]; timestamp: number } | null;
  lastSceneRadiusUpdate: { prev: number; next: number; timestamp: number } | null;
  lastPayloadIsFullState: boolean;
  metrics: PfMountDebugMetrics;
}

/** Per-canvas mount registry entry */
export interface PfWebGPUMount {
  debug?: PfMountDebug;
}

/** Logging/telemetry manager interface (minimal stub) */
export interface PfManager {
  setFrameCounters?: (counters: { frames: number; draws: number; verts: number }) => void;
  // Add other manager methods as needed
}

declare global {
  interface Window {
    /** PotFoundry telemetry manager */
    __pf_manager?: PfManager;
    /** Per-canvas WebGPU mount registry for debug introspection */
    __pf_webgpu_mounts?: Record<string, PfWebGPUMount | undefined>;
    /** Shared camera controller for embedded previews */
    __pf_webgpu_camera_controller?: CameraController;
    /** Uniform signature tracking for dirty detection */
    __lastUniformSignature?: string | null;
    /** Throttle timestamp for uniform emission */
    __lastUniformEmitMs?: number;
  }

  // Mirror on globalThis for non-window contexts
  var __pf_manager: PfManager | undefined;
  var __pf_webgpu_mounts: Record<string, PfWebGPUMount | undefined> | undefined;
  var __pf_webgpu_camera_controller: CameraController | undefined;
  var __lastUniformSignature: string | null | undefined;
  var __lastUniformEmitMs: number | undefined;
}
