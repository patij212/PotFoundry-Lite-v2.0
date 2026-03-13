/**
 * UniformBlock — Consolidated uniform buffer marshalling for WebGPU shader.
 *
 * Single source of truth for:
 * - All uniform offsets (typed constants)
 * - Conversion from WebGPUParams + WebGPUState → Float32Array
 * - Validation and clamping of input values
 *
 * This module replaces scattered f32[N] = value writes across multiple files.
 *
 * @module UniformBlock
 */

import { STYLE_IDS } from './styles/registry';
import type { WebGPUParams, WebGPUState, CameraRig } from './types';

/** 4x4 Matrix type - can be tuple or Float32Array */
export type Mat4 =
  | readonly [
      number, number, number, number,
      number, number, number, number,
      number, number, number, number,
      number, number, number, number
    ]
  | Float32Array;

// ============================================================================
// OFFSET CONSTANTS
// ============================================================================

/**
 * Typed offset constants for uniform buffer.
 * These MUST match the WGSL struct layout in shaders/common.wgsl
 *
 * Layout: 76 floats × 4 bytes = 304 bytes total
 */
export const UNIFORM_OFFSETS = {
  // ─────────────────────────────────────────────────────────────────────────
  // Geometry block (0-15)
  // ─────────────────────────────────────────────────────────────────────────
  /** Pot height in mm */
  H: 0,
  /** Radius at top in mm */
  Rt: 1,
  /** Radius at bottom in mm */
  Rb: 2,
  /** Profile exponent (curvature) */
  Expn: 3,
  /** Spiral turns count */
  SpinTurns: 4,
  /** Spiral phase offset (0-1) */
  SpinPhase: 5,
  /** Spiral curve factor */
  SpinCurve: 6,
  /** Style ID (0-18, index into style registry) */
  StyleId: 7,
  /** Superformula m parameter at base */
  SfMBase: 8,
  /** Superformula m parameter at top */
  SfMTop: 9,
  /** Superformula n1 parameter */
  SfN1: 10,
  /** Superformula n2 parameter */
  SfN2: 11,
  /** Superformula n3 parameter */
  SfN3: 12,
  /** Drain hole radius in mm */
  DrainRadius: 13,
  /** Bell bulge amplitude */
  BellAmp: 14,
  /** Bell bulge center (0-1) */
  BellCenter: 15,

  // ─────────────────────────────────────────────────────────────────────────
  // Resolution block (16-17)
  // ─────────────────────────────────────────────────────────────────────────
  /** Theta resolution (circumferential segments) */
  NTheta: 16,
  /** Z resolution (vertical slices) */
  NZ: 17,

  // ─────────────────────────────────────────────────────────────────────────
  // Rendering block (18-35)
  // ─────────────────────────────────────────────────────────────────────────
  /** Debug flag (1=overlay active) */
  DebugFlag: 18,
  /** Camera rotation X (pitch) */
  RotX: 19,
  /** Camera rotation Y (yaw) */
  RotY: 20,
  /** Camera zoom factor */
  Zoom: 21,
  /** Ambient light intensity */
  Ambient: 22,
  /** Diffuse light intensity */
  Diffuse: 23,
  /** Fresnel effect strength */
  Fresnel: 24,
  /** Wall thickness in mm */
  TWall: 25,
  /** Bottom thickness in mm */
  TBottom: 26,
  /** Inner surface segment count */
  InnerSegments: 27,
  /** Bottom rings count */
  BottomRings: 28,
  /** Camera pan X offset */
  PanX: 29,
  /** Rim rings count */
  RimRings: 30,
  /** Camera pan Y offset */
  PanY: 31,
  /** Canvas aspect ratio */
  Aspect: 32,
  /** Scene radius for camera fitting */
  SceneRadius: 33,
  /** Scene padding factor */
  Padding: 34,
  /** Camera near plane */
  Near: 35,

  // ─────────────────────────────────────────────────────────────────────────
  // Camera block (36-75)
  // ─────────────────────────────────────────────────────────────────────────
  /** Camera eye position (x,y,z) - 3 floats */
  CameraEye: 36,
  /** Camera mode (0=ortho, 1=perspective) */
  CameraMode: 39,
  /** View-Projection matrix - 16 floats */
  ViewProjection: 40,
  /** Camera right vector (vec4 for alignment) */
  CameraRight: 56,
  /** Camera up vector (vec4 for alignment) */
  CameraUp: 60,
  /** Camera forward vector (vec4 for alignment) */
  CameraForward: 64,
  /** Grid visibility flag */
  GridFlag: 68,
  /** Specular gain (0-1) */
  SpecularGain: 69,
  /** Surface roughness (0.02-1) */
  Roughness: 70,
  /** Show inner surface flag */
  ShowInner: 71,
  /** Bell bulge width parameter */
  BellWidth: 72,
  /** Seam blend angle in radians */
  SeamAngle: 73,
  /** Reserved for future use */
  Reserved74: 74,
  /** Seam radius (precomputed) */
  SeamRadius: 75,
} as const;

/** Type for uniform offset keys */
export type UniformOffsetKey = keyof typeof UNIFORM_OFFSETS;

/** Total float count in uniform buffer */
export const UNIFORM_FLOAT_COUNT = 76;

/** Total byte size of uniform buffer */
export const UNIFORM_BUFFER_SIZE = UNIFORM_FLOAT_COUNT * 4; // 304 bytes

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Clamp a value to a number, with fallback for invalid inputs.
 * Handles NaN, Infinity, undefined, null, and non-numeric values.
 */
export const clampNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
};

/**
 * Sanitize integer input with bounds.
 */
export const sanitizeInt = (
  value: unknown,
  fallback: number,
  min = 1
): number => {
  const parsed = parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return Math.max(min, Math.trunc(fallback));
  }
  return Math.trunc(parsed);
};

/**
 * Write a Vec3 to the uniform buffer at the given offset.
 */
export const writeVec3 = (
  f32: Float32Array,
  offset: number,
  v: readonly [number, number, number] | number[]
): void => {
  f32[offset + 0] = v[0];
  f32[offset + 1] = v[1];
  f32[offset + 2] = v[2];
};

/**
 * Write a Mat4 (16 floats) to the uniform buffer at the given offset.
 */
export const writeMat4 = (f32: Float32Array, offset: number, m: Mat4): void => {
  for (let i = 0; i < 16; i++) {
    f32[offset + i] = m[i];
  }
};

// ============================================================================
// STYLE RESOLUTION
// ============================================================================

/**
 * Resolve style ID from config or current params.
 * Handles numeric IDs, string names, and lookup fallbacks.
 */
export const resolveStyleId = (
  cfg: Partial<WebGPUParams>,
  current: Partial<WebGPUParams>
): number => {
  // Try numeric styleId first
  if (typeof cfg.styleId === 'number') {
    return Math.max(0, Math.trunc(cfg.styleId));
  }
  if (typeof current.styleId === 'number') {
    return Math.max(0, Math.trunc(current.styleId));
  }

  // Try string style name lookup
  const styleName = cfg.style ?? current.style;
  if (typeof styleName === 'string') {
    // Safe lookup with explicit type guard
    const styleIds = STYLE_IDS as Record<string, number>;
    if (styleName in styleIds) {
      return styleIds[styleName];
    }
  }

  // Try numeric string parsing
  if (typeof styleName === 'number') {
    return Math.max(0, Math.trunc(styleName));
  }
  if (typeof styleName === 'string' && !isNaN(Number(styleName))) {
    return Math.max(0, Math.trunc(Number(styleName)));
  }

  return 0; // Default to Plain style
};

// ============================================================================
// POPULATION INTERFACES
// ============================================================================

/**
 * Configuration for UniformBlock population.
 */
export interface UniformBlockConfig {
  /** Merged parameters (initialParams + current) */
  params: Readonly<Partial<WebGPUParams>>;
  /** Current render state */
  state: Readonly<Partial<WebGPUState>>;
  /** Camera rig with eye, basis, matrices */
  cameraRig: Readonly<CameraRig>;
  /** Padding hint from scene calculation */
  paddingHint: number;
  /** Debug overlay active flag */
  debugActive: boolean;
  /** Computed nZ for topology defaults (required for populateTopology) */
  nZ: number;
}

/**
 * Diagnostic information about uniform buffer state.
 */
export interface UniformDiagnostics {
  /** Style ID written to buffer */
  styleId: number;
  /** Resolution (nTheta × nZ) */
  resolution: [number, number];
  /** Camera eye position */
  cameraEye: [number, number, number];
  /** Camera mode string */
  cameraMode: 'ortho' | 'perspective';
  /** Whether any NaN/Infinity values were replaced */
  hadInvalidValues: boolean;
}

/**
 * UniformBlock instance for managing shader uniforms.
 */
export interface UniformBlockInstance {
  /** The Float32Array uniform buffer */
  readonly buffer: Float32Array;

  /** Populate geometry params (H, Rt, Rb, spin, style, bell, drain, seam) */
  populateGeometry(
    params: Readonly<Partial<WebGPUParams>>,
    current: Readonly<Partial<WebGPUParams>>
  ): void;

  /** Populate resolution params (nTheta, nZ) */
  populateResolution(
    params: Readonly<Partial<WebGPUParams>>,
    state: Readonly<Partial<WebGPUState>>,
    debugActive: boolean
  ): void;

  /** Populate topology params (innerSegments, bottomRings, rimRings) with nZ-derived defaults */
  populateTopology(
    params: Readonly<Partial<WebGPUParams>>,
    nZ: number
  ): void;

  /** Populate camera params (eye, basis, mode, viewProjection) */
  populateCamera(
    state: Readonly<Partial<WebGPUState>>,
    cameraRig: Readonly<CameraRig>,
    paddingHint: number
  ): void;

  /** Populate lighting params (ambient, diffuse, fresnel, specular, roughness) */
  populateLighting(params: Readonly<Partial<WebGPUParams>>): void;

  /** Populate feature flags (showInner, grid, debug) */
  populateFeatureFlags(
    params: Readonly<Partial<WebGPUParams>>,
    state: Readonly<Partial<WebGPUState>>
  ): void;

  /** Populate all uniforms in one call */
  populateAll(config: UniformBlockConfig): void;

  /** Get diagnostic info about buffer state */
  getDiagnostics(): UniformDiagnostics;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a new UniformBlock instance.
 * @param size - Buffer size in bytes (default: 304)
 */
export function createUniformBlock(
  size: number = UNIFORM_BUFFER_SIZE
): UniformBlockInstance {
  const buffer = new Float32Array(size / 4);
  buffer.fill(0);

  // Track state for diagnostics
  let lastStyleId = 0;
  let lastNTheta = 0;
  let lastNZ = 0;
  let lastCameraEye: [number, number, number] = [0, 0, 0];
  let lastCameraMode: 'ortho' | 'perspective' = 'ortho';
  let hadInvalidValues = false;

  const O = UNIFORM_OFFSETS;

  return {
    buffer,

    populateGeometry(
      params: Readonly<Partial<WebGPUParams>>,
      current: Readonly<Partial<WebGPUParams>>
    ): void {
      const c = params;
      const cur = current;

      // Core geometry
      buffer[O.H] = clampNumber(c.H, 120.0);
      buffer[O.Rt] = clampNumber(c.Rt, 70.0);
      buffer[O.Rb] = clampNumber(c.Rb, 45.0);
      buffer[O.Expn] = clampNumber(c.expn, 1.0);

      // Spin/twist - support both camelCase and snake_case
      buffer[O.SpinTurns] = clampNumber(c.spinTurns ?? c.spin_turns, 0.0);
      buffer[O.SpinPhase] = clampNumber(c.spinPhase ?? c.spin_phase, 0.0);
      buffer[O.SpinCurve] = clampNumber(c.spinCurve ?? c.spin_curve, 1.0);

      // Style ID resolution
      const styleId = resolveStyleId(params, current);
      buffer[O.StyleId] = styleId;
      lastStyleId = styleId;

      // Superformula params
      const sfMBase = c.sf_m_base ?? c.sf_m ?? 6.0;
      const sfMTop = c.sf_m_top ?? sfMBase ?? 10.0;
      buffer[O.SfMBase] = clampNumber(sfMBase, 6.0);
      buffer[O.SfMTop] = clampNumber(sfMTop, 10.0);
      buffer[O.SfN1] = clampNumber(c.sf_n1 ?? c.n1, 0.35);
      buffer[O.SfN2] = clampNumber(c.sf_n2 ?? c.n2, 0.8);
      buffer[O.SfN3] = clampNumber(c.sf_n3 ?? c.n3, 0.8);

      // Drain radius
      const drainRaw = c.r_drain ?? c.drain ?? c.drainRadius ?? c.drain_radius ?? cur.r_drain;
      buffer[O.DrainRadius] = Math.max(Math.abs(clampNumber(drainRaw, 10.0)), 0.5);

      // Bell/bulge params
      buffer[O.BellAmp] = clampNumber(c.bellAmp, 0.0);
      buffer[O.BellCenter] = clampNumber(c.bellCenter, 0.5);
      buffer[O.BellWidth] = clampNumber(c.bellWidth, 0.22);

      // Seam blending (v6: partial radius softening)
      const rawSeamAngle = clampNumber(
        c.seamAngle ?? c.seamAngleDegrees ?? c.seam_angle,
        0.0
      );
      const seamAngleRad = (rawSeamAngle * Math.PI) / 180.0;
      buffer[O.SeamAngle] = seamAngleRad;

      // Note: Topology (InnerSegments, BottomRings, RimRings) moved to populateTopology()
      // to ensure correct nZ-derived defaults. Do NOT add topology writes here.

      // Scene radius
      buffer[O.SceneRadius] = clampNumber(c.sceneRadius, 200.0);

      // Show inner default (will be overwritten by populateFeatureFlags)
      buffer[O.ShowInner] = 1.0;

      // ───────────────────────────────────────────────────────────────────
      // Style-specific parameters (indices 37-52)
      // ───────────────────────────────────────────────────────────────────
      // Clear style param block
      for (let i = 37; i <= 52; i++) buffer[i] = 0.0;

      if (styleId === 5) {
        // Gothic Arches style params
        buffer[37] = clampNumber(c.gaCounts, 12.0);
        buffer[38] = clampNumber(c.gaRelief, 1.5);
        buffer[39] = clampNumber(c.gaPointiness, 1.2);
        buffer[40] = clampNumber(c.gaDiamond, 0.5);
        buffer[41] = clampNumber(c.gaX, 0.0);
        buffer[42] = clampNumber(c.gaSpring, 0.15);
        buffer[43] = clampNumber(c.gaArchHeight, 0.7);
        buffer[44] = clampNumber(c.gaRib, 0.04);
        buffer[45] = clampNumber(c.gaCol, 0.15);
        buffer[46] = clampNumber(c.gaSharp, 4.0);
        buffer[47] = clampNumber(c.gaBands, 1.0);
        buffer[48] = clampNumber(c.gaBandW, 0.04);
      }
    },

    populateResolution(
      params: Readonly<Partial<WebGPUParams>>,
      state: Readonly<Partial<WebGPUState>>,
      debugActive: boolean
    ): void {
      const c = params;
      const MIN_THETA = 3;
      const MIN_Z = 2;

      const baseNTheta = sanitizeInt(c.nTheta ?? c.n_theta, 64, MIN_THETA);
      const baseNZ = sanitizeInt(c.nZ ?? c.n_z, 32, MIN_Z);

      const nTheta = Math.min(1024, Math.max(MIN_THETA, baseNTheta));
      const nZ = Math.min(1024, Math.max(MIN_Z, baseNZ));

      buffer[O.NTheta] = nTheta;
      buffer[O.NZ] = nZ;
      buffer[O.DebugFlag] = debugActive ? 1 : 0;

      lastNTheta = nTheta;
      lastNZ = nZ;
    },

    populateTopology(
      params: Readonly<Partial<WebGPUParams>>,
      nZ: number
    ): void {
      const c = params;

      // Compute nZ-derived defaults (matching webgpu_core.ts logic)
      const defaultInner = Math.max(1, nZ);
      const defaultBottom = Math.max(2, Math.min(24, Math.ceil(nZ * 0.25)));
      const defaultRim = Math.max(1, Math.min(8, Math.ceil(nZ * 0.1)));

      // Inner segments (default to nZ)
      const baseInner = sanitizeInt(
        c.innerSegments ?? c.inner_segments ?? defaultInner,
        defaultInner,
        1
      );
      // Bottom rings (default to nZ-derived)
      const baseBottom = sanitizeInt(
        c.bottom_rings ?? c.bottomRings ?? defaultBottom,
        defaultBottom,
        2
      );
      // Rim rings (default to nZ-derived)
      const baseRim = sanitizeInt(
        c.rim_rings ?? c.rimRings ?? defaultRim,
        defaultRim,
        1
      );

      // Final clamped values
      buffer[O.InnerSegments] = Math.max(1, baseInner);
      buffer[O.BottomRings] = Math.max(2, Math.min(24, baseBottom));
      buffer[O.RimRings] = Math.max(1, Math.min(8, baseRim));
    },

    populateCamera(
      state: Readonly<Partial<WebGPUState>>,
      cameraRig: Readonly<CameraRig>,
      paddingHint: number
    ): void {
      const s = state;

      // Rotation and zoom from state
      buffer[O.RotX] = clampNumber(s.rotX, 0.0);
      buffer[O.RotY] = clampNumber(s.rotY, 0.0);
      buffer[O.Zoom] = clampNumber(s.zoom, 1.0);
      buffer[O.PanX] = clampNumber(s.panX, 0.0);
      buffer[O.PanY] = clampNumber(s.panY, 0.0);
      buffer[O.Aspect] = clampNumber(s.canvasAspect, 1.0);
      buffer[O.SceneRadius] = clampNumber(s.sceneRadius, 200.0);
      buffer[O.Padding] = paddingHint;
      buffer[O.Near] = cameraRig.near;

      // Camera eye position
      buffer[O.CameraEye + 0] = cameraRig.eye[0];
      buffer[O.CameraEye + 1] = cameraRig.eye[1];
      buffer[O.CameraEye + 2] = cameraRig.eye[2];

      // Camera mode (0=ortho, 1=perspective)
      buffer[O.CameraMode] = cameraRig.mode === 'perspective' ? 1 : 0;

      // Camera basis vectors (vec4 for alignment)
      writeVec3(buffer, O.CameraRight, cameraRig.basis.right);
      buffer[O.CameraRight + 3] = 0;
      writeVec3(buffer, O.CameraUp, cameraRig.basis.up);
      buffer[O.CameraUp + 3] = 0;
      writeVec3(buffer, O.CameraForward, cameraRig.basis.forward);
      buffer[O.CameraForward + 3] = 0;

      // View-Projection matrix
      writeMat4(buffer, O.ViewProjection, cameraRig.viewProjection);

      // Update diagnostics state
      lastCameraEye = [cameraRig.eye[0], cameraRig.eye[1], cameraRig.eye[2]];
      lastCameraMode = cameraRig.mode === 'perspective' ? 'perspective' : 'ortho';

      // Check for invalid values
      for (let i = O.CameraEye; i < O.CameraEye + 3; i++) {
        if (!Number.isFinite(buffer[i])) {
          hadInvalidValues = true;
          break;
        }
      }
    },

    populateLighting(params: Readonly<Partial<WebGPUParams>>): void {
      const c = params;

      // Default ambient/diffuse to 0 to avoid emit-like brightness
      buffer[O.Ambient] = clampNumber(c.ambient, 0.0);
      buffer[O.Diffuse] = clampNumber(c.diffuse, 0.0);
      buffer[O.Fresnel] = clampNumber(c.fresnel, 0.25);
      buffer[O.TWall] = clampNumber(c.t_wall, 3.0);
      buffer[O.TBottom] = clampNumber(c.t_bottom, 3.0);

      // Specular and roughness
      const specular = Math.min(Math.max(clampNumber(c.specular, 0.4), 0), 1);
      const roughness = Math.min(Math.max(clampNumber(c.roughness, 0.45), 0.02), 1);
      buffer[O.SpecularGain] = specular;
      buffer[O.Roughness] = roughness;
    },

    populateFeatureFlags(
      params: Readonly<Partial<WebGPUParams>>,
      state: Readonly<Partial<WebGPUState>>
    ): void {
      const c = params;
      const s = state;

      // Show inner surface (default true)
      buffer[O.ShowInner] = c.showInner !== false ? 1 : 0;

      // Grid visibility
      buffer[O.GridFlag] = s.showGrid ? 1 : 0;
    },

    populateAll(config: UniformBlockConfig): void {
      hadInvalidValues = false;

      this.populateGeometry(config.params, config.params);
      this.populateResolution(config.params, config.state, config.debugActive);
      this.populateTopology(config.params, config.nZ);
      this.populateCamera(config.state, config.cameraRig, config.paddingHint);
      this.populateLighting(config.params);
      this.populateFeatureFlags(config.params, config.state);
    },

    getDiagnostics(): UniformDiagnostics {
      return {
        styleId: lastStyleId,
        resolution: [lastNTheta, lastNZ],
        cameraEye: lastCameraEye,
        cameraMode: lastCameraMode,
        hadInvalidValues,
      };
    },
  };
}

// ============================================================================
// BACKWARD COMPATIBILITY RE-EXPORTS
// ============================================================================

// Re-export offset constants for backward compatibility with camera_constants.ts
export const CAMERA_EYE_OFFSET = UNIFORM_OFFSETS.CameraEye;
export const CAMERA_MODE_OFFSET = UNIFORM_OFFSETS.CameraMode;
export const VP_MATRIX_OFFSET = UNIFORM_OFFSETS.ViewProjection;
export const CAMERA_RIGHT_OFFSET = UNIFORM_OFFSETS.CameraRight;
export const CAMERA_UP_OFFSET = UNIFORM_OFFSETS.CameraUp;
export const CAMERA_FORWARD_OFFSET = UNIFORM_OFFSETS.CameraForward;
export const GRID_FLAG_OFFSET = UNIFORM_OFFSETS.GridFlag;
export const DRAIN_RADIUS_OFFSET = UNIFORM_OFFSETS.DrainRadius;
export const SPECULAR_GAIN_OFFSET = UNIFORM_OFFSETS.SpecularGain;
export const ROUGHNESS_OFFSET = UNIFORM_OFFSETS.Roughness;
export const SHOW_INNER_OFFSET = UNIFORM_OFFSETS.ShowInner;
export const BELL_WIDTH_OFFSET = UNIFORM_OFFSETS.BellWidth;
export const SEAM_ANGLE_OFFSET = UNIFORM_OFFSETS.SeamAngle;
export const SEAM_RADIUS_OFFSET = UNIFORM_OFFSETS.SeamRadius;
