/**
 * CameraCommandRouter — Parses and routes incoming camera commands to handlers.
 *
 * This module separates command parsing and routing from state mutation.
 * Incoming commands (JSON strings or objects) are validated and dispatched
 * to appropriate callback handlers.
 *
 * Phase 18 extraction from webgpu_core.ts.
 *
 * @module CameraCommandRouter
 */

import type { CameraMode, WebGPUParams } from './types';
import { isCameraMode } from './types';

/** Camera payload fields that can be applied */
export interface CameraPayloadPatch {
  rotX?: number;
  rotY?: number;
  zoom?: number;
  panX?: number;
  panY?: number;
}

/** Parsed camera command with typed fields */
export interface ParsedCameraCommand {
  /** Request type (e.g., 'state' to emit current state) */
  request?: string;
  /** View preset name (top, front, right, iso, fit) */
  preset?: string;
  /** Alternative preset field */
  viewPreset?: string;
  /** Action name (reset, fit, isometric, etc.) */
  action?: string;
  /** Camera rotation fields */
  rotX?: number;
  rotY?: number;
  zoom?: number;
  panX?: number;
  panY?: number;
  /** Force flag to override local control */
  force?: boolean;
  /** Auto-rotate enable/disable */
  autoRotate?: boolean;
  /** Projection mode (perspective/ortho) */
  projection?: string;
  /** Alternative projection field */
  projectionMode?: string;
  /** Camera mode (turntable/arcball/free) */
  cameraMode?: string;
  /** Toggle grid visibility */
  toggleGrid?: boolean;
  /** Toggle axis visibility */
  toggleAxis?: boolean;
}

/** Configuration for CameraCommandRouter factory */
export interface CameraCommandRouterConfig {
  /** Emit current camera state */
  onEmitState: () => void;
  /** Apply view preset (top, front, right, iso, fit) */
  onViewPreset: (preset: string) => void;
  /** Apply camera payload (rotX, rotY, zoom, panX, panY) */
  onCameraPayload: (patch: CameraPayloadPatch, force: boolean) => void;
  /** Set auto-rotate state */
  onAutoRotate: (enabled: boolean) => void;
  /** Set projection mode */
  onProjection: (mode: 'perspective' | 'ortho') => void;
  /** Set camera mode */
  onCameraMode: (mode: CameraMode) => void;
  /** Toggle grid visibility */
  onGridToggle: () => void;
  /** Toggle axis visibility */
  onAxisToggle: () => void;
  /** Mark user interaction (for auto-rotate resume timing) */
  onMarkInteraction: () => void;
  /** Emit diagnostic (optional) */
  emitDiagnostic?: (event: string, data?: Record<string, unknown>) => void;
}

/** Instance returned by createCameraCommandRouter */
export interface CameraCommandRouterInstance {
  /**
   * Handle an incoming camera command.
   * @param raw - Raw command (JSON string or object)
   */
  handleCommand: (raw: unknown) => void;
  /**
   * Parse raw command into typed structure.
   * @param raw - Raw command (JSON string or object)
   * @returns Parsed command or null if invalid
   */
  parseCommand: (raw: unknown) => ParsedCameraCommand | null;
  /** Dispose and clean up */
  dispose: () => void;
}

/** Normalized preset names */
const VALID_PRESETS = new Set(['top', 'front', 'right', 'iso', 'fit']);

/** Action name mappings */
const ACTION_MAPPINGS: Record<string, string> = {
  reset: 'fit',
  fit: 'fit',
  isometric: 'iso',
};

/**
 * Parse raw input into a command object.
 * @param raw - Raw input (JSON string or object)
 * @returns Parsed object or null
 */
function parseRawCommand(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') {
    return raw as Record<string, unknown>;
  }
  return null;
}

/**
 * Normalize preset/action name to canonical form.
 * @param name - Raw preset or action name
 * @returns Normalized preset name or null if invalid
 */
function normalizePreset(name: string): string | null {
  const lower = name.toLowerCase();
  // Check direct preset names
  if (VALID_PRESETS.has(lower)) {
    return lower;
  }
  // Check action mappings
  if (ACTION_MAPPINGS[lower]) {
    return ACTION_MAPPINGS[lower];
  }
  return null;
}

/**
 * Create a CameraCommandRouter instance.
 *
 * @param config - Configuration with callbacks for each command type
 * @returns CameraCommandRouterInstance
 *
 * @example
 * ```ts
 * const router = createCameraCommandRouter({
 *   onEmitState: () => cameraBroadcaster.emit(true),
 *   onViewPreset: (preset) => applyViewPreset(state, preset),
 *   onCameraPayload: (patch, force) => applyCameraPayload(patch, force),
 *   onAutoRotate: (enabled) => setAutoRotate(enabled),
 *   onProjection: (mode) => setProjectionMode(mode),
 *   onCameraMode: (mode) => setCameraMode(mode),
 *   onGridToggle: () => toggleGrid(),
 *   onAxisToggle: () => toggleAxis(),
 *   onMarkInteraction: () => markInteraction(),
 * });
 * router.handleCommand({ preset: 'top' });
 * ```
 */
export function createCameraCommandRouter(
  config: CameraCommandRouterConfig
): CameraCommandRouterInstance {
  const {
    onEmitState,
    onViewPreset,
    onCameraPayload,
    onAutoRotate,
    onProjection,
    onCameraMode,
    onGridToggle,
    onAxisToggle,
    onMarkInteraction,
    emitDiagnostic,
  } = config;

  let disposed = false;

  /**
   * Parse raw command into typed structure.
   */
  const parseCommand = (raw: unknown): ParsedCameraCommand | null => {
    const obj = parseRawCommand(raw);
    if (!obj) return null;

    const cmd: ParsedCameraCommand = {};

    // Extract string fields
    if (typeof obj.request === 'string') cmd.request = obj.request;
    if (typeof obj.preset === 'string') cmd.preset = obj.preset;
    if (typeof obj.viewPreset === 'string') cmd.viewPreset = obj.viewPreset;
    if (typeof obj.action === 'string') cmd.action = obj.action;
    if (typeof obj.projection === 'string') cmd.projection = obj.projection;
    if (typeof obj.projectionMode === 'string') cmd.projectionMode = obj.projectionMode;
    if (typeof obj.cameraMode === 'string') cmd.cameraMode = obj.cameraMode;

    // Extract numeric fields
    if (typeof obj.rotX === 'number') cmd.rotX = obj.rotX;
    if (typeof obj.rotY === 'number') cmd.rotY = obj.rotY;
    if (typeof obj.zoom === 'number') cmd.zoom = obj.zoom;
    if (typeof obj.panX === 'number') cmd.panX = obj.panX;
    if (typeof obj.panY === 'number') cmd.panY = obj.panY;

    // Extract boolean fields
    if (typeof obj.force === 'boolean') cmd.force = obj.force;
    if (typeof obj.autoRotate === 'boolean') cmd.autoRotate = obj.autoRotate;
    if (obj.toggleGrid === true) cmd.toggleGrid = true;
    if (obj.toggleAxis === true) cmd.toggleAxis = true;

    return cmd;
  };

  /**
   * Handle an incoming camera command.
   */
  const handleCommand = (raw: unknown): void => {
    if (disposed) return;

    const cmd = parseCommand(raw);
    if (!cmd) {
      try {
        emitDiagnostic?.('camera-command:parse-failed', { raw: String(raw).slice(0, 100) });
      } catch {
        /* ignore */
      }
      return;
    }

    // Handle state request first (early return)
    if (cmd.request === 'state') {
      try {
        onEmitState();
      } catch {
        /* ignore handler errors */
      }
      return;
    }

    let cameraMutated = false;
    let wasPresetApplied = false;

    // Handle preset (multiple field variants)
    const presetSource = cmd.preset ?? cmd.viewPreset;
    if (presetSource) {
      const normalized = normalizePreset(presetSource);
      if (normalized) {
        try {
          onViewPreset(normalized);
          cameraMutated = true;
          wasPresetApplied = true;
        } catch {
          /* ignore handler errors */
        }
      }
    } else if (cmd.action) {
      const normalized = normalizePreset(cmd.action);
      if (normalized) {
        try {
          onViewPreset(normalized);
          cameraMutated = true;
          wasPresetApplied = true;
        } catch {
          /* ignore handler errors */
        }
      }
    }

    // Handle camera payload (rotX, rotY, zoom, panX, panY)
    const patch: CameraPayloadPatch = {};
    let patchApplied = false;

    if (typeof cmd.rotX === 'number') {
      patch.rotX = cmd.rotX;
      patchApplied = true;
    }
    if (typeof cmd.rotY === 'number') {
      patch.rotY = cmd.rotY;
      patchApplied = true;
    }
    if (typeof cmd.zoom === 'number') {
      patch.zoom = cmd.zoom;
      patchApplied = true;
    }
    if (typeof cmd.panX === 'number') {
      patch.panX = cmd.panX;
      patchApplied = true;
    }
    if (typeof cmd.panY === 'number') {
      patch.panY = cmd.panY;
      patchApplied = true;
    }

    if (patchApplied) {
      const isForce = Boolean(cmd.force);
      try {
        onCameraPayload(patch, isForce);
        cameraMutated = true;
      } catch {
        /* ignore handler errors */
      }
    }

    // Handle auto-rotate
    if (typeof cmd.autoRotate === 'boolean') {
      try {
        onAutoRotate(cmd.autoRotate);
        cameraMutated = true;
      } catch {
        /* ignore handler errors */
      }
    }

    // Handle projection mode
    const projSource = cmd.projection ?? cmd.projectionMode;
    if (projSource) {
      const nextMode = projSource === 'perspective' ? 'perspective' : 'ortho';
      try {
        onProjection(nextMode);
        cameraMutated = true;
      } catch {
        /* ignore handler errors */
      }
    }

    // Handle camera mode
    if (cmd.cameraMode && isCameraMode(cmd.cameraMode)) {
      try {
        onCameraMode(cmd.cameraMode as CameraMode);
        cameraMutated = true;
      } catch {
        /* ignore handler errors */
      }
    }

    // Handle grid toggle
    if (cmd.toggleGrid) {
      try {
        onGridToggle();
      } catch {
        /* ignore handler errors */
      }
    }

    // Handle axis toggle
    if (cmd.toggleAxis) {
      try {
        onAxisToggle();
      } catch {
        /* ignore handler errors */
      }
    }

    // Mark interaction for non-preset mutations
    // View presets handle their own timing via autoRotateResumeAt
    if (cameraMutated && !wasPresetApplied) {
      try {
        onMarkInteraction();
      } catch {
        /* ignore handler errors */
      }
    }

    // Emit diagnostic
    try {
      emitDiagnostic?.('camera-command:handled', {
        cameraMutated,
        wasPresetApplied,
        hasPayload: patchApplied,
      });
    } catch {
      /* ignore */
    }
  };

  const dispose = (): void => {
    disposed = true;
  };

  return {
    handleCommand,
    parseCommand,
    dispose,
  };
}
