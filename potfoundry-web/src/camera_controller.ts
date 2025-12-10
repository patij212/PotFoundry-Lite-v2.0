import {
  buildCameraBasis,
  quaternionFromBasis,
  basisFromQuaternion,
  quaternionFromAxisAngle,
  multiplyQuaternions,
  invertQuaternion,
  axisAngleFromQuaternion,
  arcballDelta as sharedArcballDelta,
  syncAnglesFromBasis as cbSyncAnglesFromBasis,
  rotateBasisAboutAxisFull,
  applyCameraEulerToBasis,
  quaternionFromEuler,
  PITCH_SOFT_LIMIT,
  Vec3 as HelperVec3,
  CameraBasis as HelperCameraBasis,
  Quaternion as HelperQuaternion,
  cameraAxisToWorld as cbCameraAxisToWorld,
  WORLD_UP as cbWORLD_UP,
  turntableStep,
  cameraPayloadDiffers as sharedCameraPayloadDiffers,
} from './camera_basis';

import type { Vec3 as CameraVec3, CameraBasis as CameraBasisType, Quaternion as CameraQuaternion } from './camera_basis';
import type { WebGPUState, CameraRig, Ray, WebGPUParams, CameraMode } from './types';
import { clamp, isCameraMode } from './types';
type Vec3 = CameraVec3;
type CameraBasis = CameraBasisType;
type Quaternion = CameraQuaternion;
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
  startQuat?: Quaternion;
  targetQuat?: Quaternion;
};
import * as CameraConstants from './camera_constants';

export type PointerState = {
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
  lastMoveTs?: number | null;
  arcHit?: Vec3 | null;
  arcHitNormal?: Vec3 | null;
  arcPendingPivot?: Vec3 | null;  // Pending pivot from click - applied only after drag starts
};

export type ControllerHelpers = {
  resolveInteractionRig: () => { cfg: WebGPUParams; extents: { paddedHalfWidth: number; paddedHalfHeight: number; paddedMax: number; paddingHint?: number }; rig: CameraRig };
  ensureInteractiveBasis: (state: WebGPUState) => CameraBasis;
  computePanFactor: (state: WebGPUState, canvasEl: HTMLCanvasElement) => number;
  updatePivotFromPan: () => void;
  requestCameraEmitWhenStatic: () => void;
  markInteraction: (shouldCancelFocus?: boolean) => void;
  worldRayFromCanvas?: (rig: CameraRig, canvas: HTMLCanvasElement, clientX: number, clientY: number) => Ray | null;
  intersectRayZPlane?: (ray: Ray, z: number) => Vec3 | null;
  intersectRayCylinder?: (ray: Ray, radius: number, minZ: number, maxZ: number) => Vec3 | null;
  buildCameraRig?: (s: WebGPUState, paddingHint: number, paddedHalfWidth?: number | null, paddedHalfHeight?: number | null) => CameraRig | null;
  clampZoomValue?: (v: number) => number;
  cancelCameraEmit?: () => void;
  setAutoRotate?: (v: boolean, emit?: boolean) => void;
  setCameraMode?: (mode: CameraMode) => void;
  freeKeyboard?: { activeKeys: Set<string>; boost: boolean };
  // Optional math helpers exported for host previews and embedding. If
  // present these will be used by previews to ensure consistent quaternion
  // math, axis conversions, and angle sync behavior.
  quaternionFromAxisAngle?: (axis: Vec3, angle: number) => HelperQuaternion;
  multiplyQuaternions?: (a: HelperQuaternion, b: HelperQuaternion) => HelperQuaternion;
  invertQuaternion?: (q: HelperQuaternion) => HelperQuaternion;
  axisAngleFromQuaternion?: (q: HelperQuaternion) => { axis: Vec3; angle: number };
  basisFromQuaternion?: (q: HelperQuaternion) => HelperCameraBasis;
  cameraAxisToWorld?: (basis: HelperCameraBasis, axis: Vec3) => Vec3;
  syncAnglesFromBasis?: (basis: HelperCameraBasis) => { rotX: number; rotY: number };
  writeUniformsImmediately?: () => void;
};

export class CameraController {
  state: WebGPUState;
  pointer: PointerState;
  canvas: HTMLCanvasElement;
  focusTween: FocusTween | null;
  helpers: ControllerHelpers;
  // Last seen camera nonce to detect forced host updates
  lastCameraNonce: number | null = null;
  // Grace window timestamp tracking for local control
  localControlLastAt = 0;
  // If present, a deferred forced camera payload which will be applied
  // after the local-control grace window ends and the payload meaningfully differs
  pendingForceCameraPayload: WebGPUParams | null = null;
  readonly LOCAL_CAMERA_GRACE_MS = 1000;
  setLocalCameraGraceMs(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) return;
    (this as any).LOCAL_CAMERA_GRACE_MS = Math.max(0, Math.floor(ms));
  }
  hostCameraAcceptPolicy: 'always' | 'grace' | 'strict' = 'grace';

  constructor(state: WebGPUState, pointer: PointerState, canvas: HTMLCanvasElement, helpers: ControllerHelpers) {
    this.state = state;
    this.pointer = pointer;
    this.canvas = canvas;
    this.focusTween = null;
    this.helpers = helpers;
  }

  // Reasonable run-time caps for inertial speeds to avoid runaway drifting
  static readonly MAX_ARC_INERTIA_SPEED = Math.PI * 8; // rad/s
  static readonly MAX_ROT_INERTIA_SPEED = Math.PI * 6; // rad/s (yaw/pitch)
  static readonly MAX_PAN_INERTIA_SPEED = 1000; // world units/sec

  setHostCameraAcceptPolicy(policy: 'always' | 'grace' | 'strict') {
    this.hostCameraAcceptPolicy = policy;
  }

  cameraPayloadDiffers(payload: WebGPUParams, s: WebGPUState): boolean {
    // Delegate to shared tolerant payload comparison helper.
    try {
      return sharedCameraPayloadDiffers(s as Record<string, unknown>, (payload as Record<string, unknown>) ?? {} as Record<string, unknown>);
    } catch (err) {
      return true;
    }
  }

  applyPayloadToState(payload: WebGPUParams, force: boolean): void {
    if (!payload) return;
    const allowCamera = force || !this.state.interacting;
    let mutated = false;
    if (allowCamera) {
      if (typeof payload.rotX === 'number') {
        this.state.rotX = payload.rotX;
        mutated = true;
      }
      if (typeof payload.rotY === 'number') {
        this.state.rotY = payload.rotY;
        mutated = true;
      }
      if (typeof payload.zoom === 'number') {
        this.state.zoom = payload.zoom;
        mutated = true;
      }
      if (typeof payload.panX === 'number') {
        this.state.panX = payload.panX;
        mutated = true;
      }
      if (typeof payload.panY === 'number') {
        this.state.panY = payload.panY;
        mutated = true;
      }
      if (typeof payload.projection === 'string') {
        const nextMode = payload.projection === 'perspective' ? 'perspective' : 'ortho';
        if (this.state.projectionMode !== nextMode) {
          this.state.projectionMode = nextMode;
          mutated = true;
        }
      }
      const applyCameraMode = (mode: CameraMode) => {
        if (typeof this.helpers.setCameraMode === 'function') {
          this.helpers.setCameraMode(mode);
        } else {
          this.state.cameraMode = mode;
          this.state.useArcball = mode === 'arcball';
        }
      };
      if (isCameraMode(payload.cameraMode)) {
        if (payload.cameraMode !== this.state.cameraMode) {
          applyCameraMode(payload.cameraMode);
          mutated = true;
        } else if (this.state.useArcball !== (payload.cameraMode === 'arcball')) {
          this.state.useArcball = payload.cameraMode === 'arcball';
          mutated = true;
        }
      } else if (typeof payload.useArcball === 'boolean') {
        const targetMode: CameraMode = payload.useArcball ? 'arcball' : 'turntable';
        if (targetMode !== this.state.cameraMode) {
          applyCameraMode(targetMode);
          mutated = true;
        } else if (this.state.useArcball !== payload.useArcball) {
          this.state.useArcball = payload.useArcball;
          mutated = true;
        }
      }
      if (typeof payload.autoPivotFromCamera === 'boolean') {
        this.state.autoPivotFromCamera = Boolean(payload.autoPivotFromCamera);
        mutated = true;
      }
      if (mutated) {
        // ensure display orientation synced with committed angles
        // delegate to helpers for complex basis operations if present
        try {
          const basis = this.ensureInteractiveBasis();
          const angles = cbSyncAnglesFromBasis(basis);
          this.state.displayRotX = angles.rotX;
          this.state.displayRotY = angles.rotY;
        } catch (err) {
          /* ignore */
        }
        this.state.cameraDirty = true;
        // Update debug status on the mount (if present) so E2E tests can
        // assert that the controller applied a camera payload.
        try {
          const id = this.canvas && typeof this.canvas.getAttribute === 'function' ? this.canvas.getAttribute('data-pf-wgpu-id') ?? 'pf-wgpu-default' : 'pf-wgpu-default';
          const root: any = typeof window !== 'undefined' ? window : (globalThis as any);
          root.__pf_webgpu_mounts = root.__pf_webgpu_mounts || {};
          const dbg = root.__pf_webgpu_mounts[id]?.debug;
          if (dbg) {
            dbg.lastApplyCameraPayload = { fields: Object.keys(payload), timestamp: Date.now() };
            dbg.lastPayloadIsFullState = !!force;
          }
        } catch (err) {
          /* ignore */
        }
      }
    }
    if (force) {
      // when a forced update occurs, clear local control timestamp so host can
      // continue pushing updates after this point.
      this.localControlLastAt = 0;
    }
  }

  setPayload(payload: WebGPUParams | null | undefined, options?: { force?: boolean; forceFull?: boolean }): void {
    if (!payload) return;
    const nowMs = Date.now();
    // compute rawCameraNonce strictly from the incoming payload
    const rawCameraNonce = typeof (payload as Record<string, unknown>).cameraNonce === 'number' ? (payload as Record<string, unknown>).cameraNonce as number : null;
    const nonceForce = rawCameraNonce !== null && rawCameraNonce !== this.lastCameraNonce;
    if (nonceForce) {
      this.lastCameraNonce = rawCameraNonce;
    }
    const force = Boolean(options?.force) || nonceForce || Boolean(options?.forceFull);
    // Honor explicit host accept policy
    if (this.hostCameraAcceptPolicy === 'strict' && !force) {
      return;
    }
    // Ignore non-forced payloads while interacting or within grace window (unless 'always')
    if (!force && this.hostCameraAcceptPolicy !== 'always' && (this.state.interacting || nowMs - this.localControlLastAt < this.LOCAL_CAMERA_GRACE_MS)) {
      return;
    }
    // Defer forced payloads if interacting or within grace window
    if (force && (this.state.interacting || nowMs - this.localControlLastAt < this.LOCAL_CAMERA_GRACE_MS)) {
      this.pendingForceCameraPayload = { ...payload } as WebGPUParams;
      return;
    }
    // Otherwise apply immediately
    this.applyPayloadToState(payload as WebGPUParams, force);
  }

  maybeApplyDeferredForceIfReady(nowMs?: number): void {
    const t = nowMs ?? Date.now();
    if (!this.pendingForceCameraPayload) return;
    const msSinceLocal = t - this.localControlLastAt;
    if (this.state.interacting) return;
    if (msSinceLocal < this.LOCAL_CAMERA_GRACE_MS) return;
    const deferred = this.pendingForceCameraPayload as WebGPUParams;
    // Clear pending first to prevent reentrancy
    this.pendingForceCameraPayload = null;
    if (this.cameraPayloadDiffers(deferred, this.state)) {
      // update debug info indicating a deferred forced payload is being applied
      try {
        const id = this.canvas && typeof this.canvas.getAttribute === 'function' ? this.canvas.getAttribute('data-pf-wgpu-id') ?? 'pf-wgpu-default' : 'pf-wgpu-default';
        const root: any = typeof window !== 'undefined' ? window : (globalThis as any);
        root.__pf_webgpu_mounts = root.__pf_webgpu_mounts || {};
        const dbg = root.__pf_webgpu_mounts[id]?.debug;
        if (dbg) {
          dbg.lastApplyCameraPayload = { fields: Object.keys(deferred), timestamp: Date.now() };
          dbg.lastPayloadIsFullState = true;
        }
      } catch (err) {
        /* ignore */
      }
      this.applyPayloadToState(deferred, true);
    }
  }

  ensureInteractiveBasis(): CameraBasis {
    return this.helpers.ensureInteractiveBasis(this.state);
  }

  ensureFreePosition(stateArg?: WebGPUState): Vec3 {
    const s = stateArg ?? this.state;
    const pos = s.freePosition;
    if (Array.isArray(pos) && pos.length === 3 && pos.every((v) => Number.isFinite(v))) {
      return pos as Vec3;
    }
    const pivotZ = s.pivot?.[2] ?? 0;
    const fallback: Vec3 = [s.panX, s.panY - Math.max(s.sceneRadius * 2.2, 120), pivotZ + Math.max(s.sceneRadius * 0.25, 30)];
    s.freePosition = fallback;
    return fallback;
  }

  translateFreeCamera(stateArg: WebGPUState, delta: Vec3): void {
    const pos = this.ensureFreePosition(stateArg);
    stateArg.freePosition = [pos[0] + delta[0], pos[1] + delta[1], pos[2] + delta[2]];
    stateArg.cameraDirty = true;
  }

  applyFreeLookRotation(dx: number, dy: number): void {
    const vw = this.canvas.clientWidth || Math.max(1, this.canvas.width || 1);
    const vh = this.canvas.clientHeight || Math.max(1, this.canvas.height || 1);
    const basis = this.ensureInteractiveBasis();
    const yawDelta = (-dx / Math.max(1, vw)) * 1.8 * Math.PI;
    const pitchDelta = (-dy / Math.max(1, vh)) * Math.PI;
    let rotated = rotateBasisAboutAxisFull(basis, basis.up, yawDelta) ?? basis;
    rotated = rotateBasisAboutAxisFull(rotated, rotated.right, pitchDelta) ?? rotated;
    const angles = cbSyncAnglesFromBasis(rotated);
    let rotX = angles.rotX;
    // Use canonical soft-limit from shared math to keep consistent across modes
    if (rotX > PITCH_SOFT_LIMIT) {
      const correction = rotX - PITCH_SOFT_LIMIT;
      rotated = rotateBasisAboutAxisFull(rotated, rotated.right, -correction) ?? rotated;
      rotX = PITCH_SOFT_LIMIT;
    } else if (rotX < -1.2) {
      const correction = rotX + PITCH_SOFT_LIMIT;
      rotated = rotateBasisAboutAxisFull(rotated, rotated.right, -correction) ?? rotated;
      rotX = -PITCH_SOFT_LIMIT;
    }
    this.state.displayCamRight = [...rotated.right];
    this.state.displayCamUp = [...rotated.up];
    this.state.displayCamForward = [...rotated.forward];
    this.state.displayCamQuat = quaternionFromBasis(rotated);
    this.state.displayRotX = rotX;
    this.state.displayRotY = angles.rotY;
    this.state.cameraDirty = true;
  }

  applyFreeLookPan(dx: number, dy: number): void {
    const factor = this.computePanFactor(this.canvas) * this.state.freeSpeed * 0.85;
    const basis = this.ensureInteractiveBasis();
    const deltaRight = [basis.right[0] * -dx * factor, basis.right[1] * -dx * factor, basis.right[2] * -dx * factor] as Vec3;
    const deltaUp = [basis.up[0] * dy * factor, basis.up[1] * dy * factor, basis.up[2] * dy * factor] as Vec3;
    this.translateFreeCamera(this.state, [deltaRight[0] + deltaUp[0], deltaRight[1] + deltaUp[1], deltaRight[2] + deltaUp[2]]);
  }

  applyFreeLookDolly(delta: number): void {
    const basis = this.ensureInteractiveBasis();
    const move = [basis.forward[0] * delta * this.state.sceneRadius * 0.0025, basis.forward[1] * delta * this.state.sceneRadius * 0.0025, basis.forward[2] * delta * this.state.sceneRadius * 0.0025] as Vec3;
    this.translateFreeCamera(this.state, move);
  }

  applyFreeKeyboardInput(deltaMs: number): boolean {
    // Professional WASD/QE navigation - works in all camera modes
    // Free mode: 3D movement, Orbit modes: pan/zoom
    try {
      const keys = this.helpers.freeKeyboard?.activeKeys;
      if (!keys || keys.size === 0) return false;

      // Use constants for professional speed scaling
      const baseSpeed = (CameraConstants as any).FREE_MOVE_SPEED_BASE ?? 100.0;
      const boostMultiplier = (CameraConstants as any).FREE_MOVE_SPEED_BOOST ?? 3.0;
      const boost = this.helpers.freeKeyboard?.boost ? boostMultiplier : 1.0;

      // Scale movement by scene radius for consistent feel regardless of object size
      const sceneScale = Math.max(this.state.sceneRadius / 100, 0.5);
      const speed = baseSpeed * sceneScale * (this.state.freeSpeed || 1) * boost;
      const s = (deltaMs / 1000) * speed;

      if (this.state.cameraMode === 'free') {
        // FREE MODE: Full 3D movement
        const basis = this.ensureInteractiveBasis();
        const forward: Vec3 = basis.forward;
        const right: Vec3 = basis.right;
        const up: Vec3 = basis.up;

        let dx = 0;
        let dy = 0;
        let dz = 0;

        // Forward/backward (W/S)
        if (keys.has('w')) {
          dx += forward[0] * s; dy += forward[1] * s; dz += forward[2] * s;
        }
        if (keys.has('s')) {
          dx -= forward[0] * s; dy -= forward[1] * s; dz -= forward[2] * s;
        }
        // Strafe left/right (A/D)
        if (keys.has('a')) {
          dx -= right[0] * s; dy -= right[1] * s; dz -= right[2] * s;
        }
        if (keys.has('d')) {
          dx += right[0] * s; dy += right[1] * s; dz += right[2] * s;
        }
        // Vertical movement (Q/E) - Q goes down, E goes up
        if (keys.has('q')) {
          dx -= up[0] * s; dy -= up[1] * s; dz -= up[2] * s;
        }
        if (keys.has('e')) {
          dx += up[0] * s; dy += up[1] * s; dz += up[2] * s;
        }

        if (dx === 0 && dy === 0 && dz === 0) return false;
        this.translateFreeCamera(this.state, [dx, dy, dz]);
        this.state.cameraDirty = true;
        return true;
      } else {
        // ORBIT MODES (turntable, arcball, orbit): Pan with WASD, tilt with Q/E
        // Pan along camera axes so movement is relative to current view
        const panFactor = this.computePanFactor(this.canvas);
        const panSpeed = s * panFactor * 2.0; // Fast, scene-aware panning
        let panRight = 0;  // Along camera right axis
        let panUp = 0;     // Along camera up axis
        let tiltDelta = 0;

        // A/D = pan left/right (along camera right axis)
        if (keys.has('a')) panRight -= panSpeed;
        if (keys.has('d')) panRight += panSpeed;
        // W/S = pan up/down (along camera up axis)
        if (keys.has('w')) panUp += panSpeed;
        if (keys.has('s')) panUp -= panSpeed;
        // Q/E = tilt camera (rotate around view axis)
        if (keys.has('q')) tiltDelta -= 0.03 * boost;
        if (keys.has('e')) tiltDelta += 0.03 * boost;

        if (panRight === 0 && panUp === 0 && tiltDelta === 0) return false;

        // Track if we need to mark interaction (only for tilt, not pan during drag)
        let shouldMarkInteraction = false;

        // Apply pan along camera axes (project to XY plane)
        if (panRight !== 0 || panUp !== 0) {
          const basis = this.ensureInteractiveBasis();
          const camRight = basis.right;
          const camUp = basis.up;
          // Project camera right/up onto XY plane for panning
          // Use only X and Y components of camera vectors
          const rightXY = Math.hypot(camRight[0], camRight[1]);
          const upXY = Math.hypot(camUp[0], camUp[1]);
          // If camera is looking straight down/up, use world axes
          if (rightXY > 0.1) {
            this.state.panX += (camRight[0] / rightXY) * panRight;
            this.state.panY += (camRight[1] / rightXY) * panRight;
          } else {
            this.state.panX += panRight;
          }
          if (upXY > 0.1) {
            this.state.panX += (camUp[0] / upXY) * panUp;
            this.state.panY += (camUp[1] / upXY) * panUp;
          } else {
            this.state.panY += panUp;
          }
          this.updatePivotFromPan();
        }

        // Apply tilt (camera roll around view axis) via rotZ
        // This smoothly tilts during autorotate without causing jumps
        if (tiltDelta !== 0) {
          // Update rotZ angle incrementally
          const currentRotZ = (this.state as any).displayRotZ ?? this.state.rotZ ?? 0;
          const newRotZ = currentRotZ + tiltDelta;
          this.state.rotZ = newRotZ;
          (this.state as any).displayRotZ = newRotZ;

          // Get current display angles (these are being continuously updated by autorotate)
          const rotX = (this.state.displayRotX ?? this.state.rotX) as number;
          const rotY = (this.state.displayRotY ?? this.state.rotY) as number;

          // Rebuild DISPLAY basis only (don't touch committed cam* during autorotate)
          const newQuat = quaternionFromEuler(rotX, rotY, newRotZ);
          const newBasis = basisFromQuaternion(newQuat);

          // Update display basis for rendering
          this.state.displayCamRight = [...newBasis.right];
          this.state.displayCamUp = [...newBasis.up];
          this.state.displayCamForward = [...newBasis.forward];
          this.state.displayCamQuat = [...newQuat] as Quaternion;

          // Don't pause autorotate for Q/E - let it keep spinning with the new tilt
          // shouldMarkInteraction = true; // Removed to allow smooth tilt during autorotate
        }

        this.state.cameraDirty = true;
        this.helpers.requestCameraEmitWhenStatic?.();
        return true;
      }
    } catch (err) {
      return false;
    }
  }

  commitDisplayBasisToState(): boolean {
    if (!this.state.displayCamForward || !this.state.displayCamUp || !this.state.displayCamRight) return false;
    const prevRight = this.state.camRight;
    let flipped = false;
    if (prevRight && this.state.displayCamRight && this.state.cameraMode !== 'arcball' && !this.state.interacting && !this.state.disableAutoFlip) {
      const dot = prevRight[0] * this.state.displayCamRight[0] + prevRight[1] * this.state.displayCamRight[1] + prevRight[2] * this.state.displayCamRight[2];
      // Only flip the basis when not in arcball mode and when the new
      // right vector is nearly inverted relative to the previous one.
      // Arcball mode purposefully avoids roll flips — the user expects
      // persistent object control with continuous rotations in 3D, not
      // a 180° snap. Hence we skip this flip for arcball.
      if (dot < CameraConstants.BASIS_FLIP_DOT_THRESHOLD) {
        this.state.displayCamRight = [this.state.displayCamRight[0] * -1, this.state.displayCamRight[1] * -1, this.state.displayCamRight[2] * -1];
        this.state.displayCamUp = [this.state.displayCamUp[0] * -1, this.state.displayCamUp[1] * -1, this.state.displayCamUp[2] * -1];
        flipped = true;
      }
    }
    const committedBasis: CameraBasis = {
      right: [...this.state.displayCamRight],
      up: [...this.state.displayCamUp],
      forward: [...this.state.displayCamForward],
    } as CameraBasis;
    // Ensure we prefer an up-vector that keeps the camera right-side-up
    // relative to world-up when possible. If the committed up vector has
    // negative Z, flip the basis roll by negating right/up.
    if (this.state.cameraMode !== 'arcball' && (committedBasis.up[2] ?? 0) < 0 && !this.state.interacting && !this.state.disableAutoFlip) {
      committedBasis.right = [committedBasis.right[0] * -1, committedBasis.right[1] * -1, committedBasis.right[2] * -1];
      committedBasis.up = [committedBasis.up[0] * -1, committedBasis.up[1] * -1, committedBasis.up[2] * -1];
      flipped = !flipped; // record that we flipped
    }
    this.state.camForward = [...committedBasis.forward];
    this.state.camUp = [...committedBasis.up];
    this.state.camRight = [...committedBasis.right];
    this.state.camQuat = quaternionFromBasis(committedBasis);
    // Sync canonical Euler-ish orbit angles (turntable) from the basis so
    // payload comparison and host-diff logic operate on the committed,
    // authoritative values instead of stale rotX/rotY. This prevents
    // race-conditions where display-only angles could be overwritten
    // by host defaults after a grace window.
    // For turntable mode, prefer the displayRotX/Y values directly since
    // those are the authoritative angles that were used to build the basis.
    // Re-deriving angles from the basis via syncAnglesFromBasis can
    // introduce numeric drift or sign flips that cause "restart" issues
    // where the next drag doesn't continue from the visual position.
    if (this.state.cameraMode === 'turntable' && this.state.displayRotX !== null && this.state.displayRotY !== null) {
      this.state.rotX = this.state.displayRotX as number;
      this.state.rotY = this.state.displayRotY as number;
    } else {
      try {
        const angles = cbSyncAnglesFromBasis(committedBasis as HelperCameraBasis);
        this.state.rotX = angles.rotX;
        this.state.rotY = angles.rotY;
      } catch (err) {
        // If angle sync fails, prefer to leave rotX/rotY unchanged rather
        // than throw — defensive behavior to avoid breaking at runtime.
      }
    }
    // Emit diagnostic in debug-mode when available — the parent mount will
    // choose whether to send diagnostics; we leave UI-side emission to the
    // host. We set a flag on state to help debug.
    this.state.recentBasisCommit = { right: [...committedBasis.right], up: [...committedBasis.up], forward: [...committedBasis.forward] } as any;
    // Sync angles is expected to be performed externally in commit path
    this.state.displayCamForward = null;
    // Optionally update pivot from camera center ray when configured
    try {
      if (this.state.autoPivotFromCamera) {
        this.updatePivotFromCamera();
      }
    } catch (err) {
      /* ignore pivot update failures */
    }
    this.state.displayCamUp = null;
    this.state.displayCamRight = null;
    this.state.displayCamQuat = null;
    this.state.displayRotX = null;
    this.state.displayRotY = null;
    // Force an immediate uniform update so shader projection uses the committed basis
    try {
      this.state.cameraDirty = true;
      this.helpers.writeUniformsImmediately?.();
    } catch (err) {
      /* best-effort */
    }
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
      const { extents } = this.helpers.resolveInteractionRig();
      const paddedMax = extents.paddedMax;
      const CAMERA_DISTANCE_FALLOFF = CameraConstants.CAMERA_DISTANCE_FALLOFF;
      const minZoom = 0.25;
      const maxZoom = 4.0;
      const zoomFromDepth = Math.max(minZoom, Math.min(maxZoom, paddedMax * CAMERA_DISTANCE_FALLOFF / Math.max(hitDepth, 1e-3)));
      adjustedZoom = zoomFromDepth;
    }
    const baseQuat = (this.state.displayCamQuat ?? this.state.camQuat) as Quaternion;
    // Compute target quaternion by synthesizing a temporary state with the target pan/zoom
    let targetQuat: Quaternion | undefined = undefined;
    try {
      const { extents } = this.helpers.resolveInteractionRig();
      const fakeState = { ...this.state, panX: targetPanX, panY: targetPanY, zoom: adjustedZoom } as WebGPUState;
      const rigAfter = this.helpers.buildCameraRig?.(fakeState, extents.paddingHint ?? 0, extents.paddedHalfWidth, extents.paddedHalfHeight);
      if (rigAfter && rigAfter.basis) {
        targetQuat = quaternionFromBasis(rigAfter.basis);
      }
    } catch (e) {
      // If helper fails, leave targetQuat undefined and default to current quaternion
    }
    // Cancel inertia to avoid playback or spinning during the focus animation
    this.resetInertia();
    // Keep the controller in an 'interacting' state for the duration of the tween
    this.state.interacting = true;
    this.localControlLastAt = Date.now();
    this.state.lastInteraction = this.localControlLastAt;
    this.focusTween = {
      startTime: performance.now(),
      duration: 260,
      startPanX: this.state.panX,
      startPanY: this.state.panY,
      startZoom: this.state.zoom,
      targetPanX,
      targetPanY,
      targetZoom: adjustedZoom,
      startQuat: baseQuat,
      targetQuat: targetQuat ?? baseQuat,
    };
    return this.focusTween;
  }

  zoomCameraAtCursor(clientX: number, clientY: number, factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    if (this.state.cameraMode === 'free') {
      const magnitude = Math.log(factor || 1) * 320;
      this.applyFreeLookDolly(magnitude);
      return;
    }
    const nextZoom = (this.helpers.clampZoomValue?.(this.state.zoom * factor)) ?? this.state.zoom * factor;
    if (Math.abs(nextZoom - this.state.zoom) < 1e-6) return;
    const { extents, rig } = this.helpers.resolveInteractionRig();
    const rayBefore = this.helpers.worldRayFromCanvas?.(rig as any, this.canvas, clientX, clientY);
    const pivotZ = this.state.pivot?.[2] ?? 0;
    const anchor = rayBefore ? this.helpers.intersectRayZPlane?.(rayBefore, pivotZ) : null;
    this.state.zoom = nextZoom;
    if (anchor) {
      const rigAfter = this.helpers.buildCameraRig?.(this.state, extents.paddingHint ?? 0, extents.paddedHalfWidth, extents.paddedHalfHeight);
      const rayAfter = this.helpers.worldRayFromCanvas?.(rigAfter as any, this.canvas, clientX, clientY);
      if (rayAfter) {
        const projected = this.helpers.intersectRayZPlane?.(rayAfter, pivotZ);
        if (projected) {
          this.state.panX += anchor[0] - projected[0];
          this.state.panY += anchor[1] - projected[1];
          this.updatePivotFromPan();
        }
      }
    }
    this.state.cameraDirty = true;
  }

  resolveActiveBasis(): CameraBasis {
    const hasDisplay = Boolean(this.state.displayCamForward && this.state.displayCamUp && this.state.displayCamRight);
    const sourceBasis: CameraBasis = hasDisplay
      ? {
        right: [...(this.state.displayCamRight as Vec3)] as Vec3,
        up: [...(this.state.displayCamUp as Vec3)] as Vec3,
        forward: [...(this.state.displayCamForward as Vec3)] as Vec3,
      }
      : {
        right: [...(this.state.camRight as Vec3)] as Vec3,
        up: [...(this.state.camUp as Vec3)] as Vec3,
        forward: [...(this.state.camForward as Vec3)] as Vec3,
      };
    // Normalize via camera_basis helper; sync to state
    // We prefer using quaternion conversions and cbSyncAngles
    const normalized: CameraBasis = sourceBasis as CameraBasis;
    if (hasDisplay) {
      this.state.displayCamRight = [...normalized.right];
      this.state.displayCamUp = [...normalized.up];
      this.state.displayCamForward = [...normalized.forward];
      this.state.displayCamQuat = quaternionFromBasis(normalized);
      const nextAngles = cbSyncAnglesFromBasis(normalized as HelperCameraBasis);
      this.state.displayRotX = nextAngles.rotX;
      this.state.displayRotY = nextAngles.rotY;
    } else {
      this.state.camRight = [...normalized.right];
      this.state.camUp = [...normalized.up];
      this.state.camForward = [...normalized.forward];
      this.state.camQuat = quaternionFromBasis(normalized);
    }
    return normalized;
  }

  focusCameraAtCursor(clientX: number, clientY: number) {
    const { rig, extents } = this.helpers.resolveInteractionRig();
    const ray = this.helpers.worldRayFromCanvas?.(rig as any, this.canvas, clientX, clientY);
    if (!ray) return;
    const pivotZ = this.state.pivot?.[2] ?? 0;
    const cylinderHit = this.helpers.intersectRayCylinder?.(ray as any, extents.paddedHalfWidth, -extents.paddedHalfHeight, extents.paddedHalfHeight) ?? null;
    const hit = cylinderHit ?? this.helpers.intersectRayZPlane?.(ray as any, pivotZ) ?? null;
    if (!hit) return;
    if (this.state.cameraMode === 'free') {
      // Free camera: move to a position looking at the hit point
      const distance = Math.max(this.state.sceneRadius * 0.5, 50);
      this.state.freePosition = [hit[0], hit[1], hit[2] + distance];
      const look = [hit[0] - this.state.freePosition[0], hit[1] - this.state.freePosition[1], hit[2] - this.state.freePosition[2]] as Vec3;
      const n = Math.hypot(look[0], look[1], look[2]);
      if (n > 1e-6) {
        look[0] /= n; look[1] /= n; look[2] /= n;
      }
      const newBasis = buildCameraBasis(look);
      this.state.displayCamRight = [...newBasis.right];
      this.state.displayCamUp = [...newBasis.up];
      this.state.displayCamForward = [...newBasis.forward];
      this.state.displayCamQuat = quaternionFromBasis(newBasis);
      const angles = cbSyncAnglesFromBasis(newBasis as HelperCameraBasis);
      this.state.displayRotX = angles.rotX;
      this.state.displayRotY = angles.rotY;
      this.state.cameraDirty = true;
      this.helpers.requestCameraEmitWhenStatic?.();
      return;
    }
    // Orbit mode: start a smooth focus tween toward the hit location
    // Professional CAD behavior: zoom in slightly when focusing on a point
    this.helpers.cancelCameraEmit?.();
    const focusZoomFactor = (CameraConstants as any).FOCUS_ZOOM_FACTOR ?? 1.5;
    const targetZoom = this.helpers.clampZoomValue?.(this.state.zoom * focusZoomFactor) ?? this.state.zoom * focusZoomFactor;
    this.startFocusTween(hit[0], hit[1], targetZoom, hit[2]);
    this.state.cameraDirty = true;
    this.markInteraction(false);
    this.helpers.requestCameraEmitWhenStatic?.();
  }

  updatePivotFromCamera() {
    // Compute center-screen world ray and update pivot (and pan) if hit
    const rect = this.canvas.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const { rig, extents } = this.helpers.resolveInteractionRig();
    const ray = this.helpers.worldRayFromCanvas?.(rig as any, this.canvas, centerX, centerY);
    if (!ray) return false;
    const pivotZ = this.state.pivot?.[2] ?? 0;
    const cylinderHit = this.helpers.intersectRayCylinder?.(ray as any, extents.paddedHalfWidth, -extents.paddedHalfHeight, extents.paddedHalfHeight) ?? null;
    const hit = cylinderHit ?? this.helpers.intersectRayZPlane?.(ray as any, pivotZ) ?? null;
    if (!hit) return false;
    if (this.state.cameraMode === 'free') return false; // free mode doesn't use pivot
    // Set panX/panY and pivot as hit location
    this.state.panX = hit[0];
    this.state.panY = hit[1];
    this.state.pivot = [hit[0], hit[1], hit[2]] as Vec3;
    this.state.cameraDirty = true;
    this.helpers.requestCameraEmitWhenStatic?.();
    return true;
  }

  markInteraction(shouldCancelFocus = true) {
    if (shouldCancelFocus) this.cancelFocusTween();
    this.state.interacting = true;
    this.state.lastInteraction = performance.now();
    // record the timestamp for local control so host forced updates can be
    // deferred during this grace window.
    this.localControlLastAt = this.state.lastInteraction;
    this.state.cameraDirty = true;
    // Schedule autorotate resume after interaction ends (if autorotate is enabled)
    if (this.state.autoRotate) {
      const resumeDelay = (CameraConstants as any).AUTOROTATE_RESUME_DELAY_MS ?? 3000;
      this.state.autoRotateResumeAt = performance.now() + resumeDelay;
    }
    // If a forced payload was pending while the user starts interacting again,
    // drop it — the user intent to control the view takes precedence.
    if (this.pendingForceCameraPayload) {
      this.pendingForceCameraPayload = null;
    }
  }

  // Pointer handlers (lightweight implementations for tests)
  releasePointer() {
    const arcballDrag = this.pointer.mode === 'orbit' && this.state.cameraMode === 'arcball';
    if (arcballDrag && this.pointer.arcInertiaAxis && Math.abs(this.pointer.arcInertiaSpeed) > 1e-5) {
      this.state.inertiaArcAxis = [this.pointer.arcInertiaAxis[0], this.pointer.arcInertiaAxis[1], this.pointer.arcInertiaAxis[2]];
      // clamp initial arc inertia speed to avoid runaway values from mouse spikes
      const raw = this.pointer.arcInertiaSpeed * 0.35;
      const maxVal = CameraController.MAX_ARC_INERTIA_SPEED;
      const clamped = Math.sign(raw) * Math.min(maxVal, Math.abs(raw));
      this.state.inertiaArcSpeed = clamped;
      // Expose debug snapshot for diagnostics
      try { (this.state as any).recentInertia = { type: 'arc', raw: this.pointer.arcInertiaSpeed, clamped, axis: this.pointer.arcInertiaAxis, ts: Date.now() }; } catch (e) {/* best-effort */ }
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
    this.pointer.arcHit = null;
    this.pointer.arcHitNormal = null;
    this.pointer.arcPendingPivot = null;
    // Clear lastMoveTs when the pointer is released to avoid spurious dt
    this.pointer.lastMoveTs = null;
  }

  /**
   * Initialize arcball-specific state for a new drag operation.
   * Captures the starting quaternion for pure arcball rotation.
   */
  private initArcballDrag(event: PointerEvent, _mode: PointerMode): void {
    // Store start position for arcball delta calculation
    this.pointer.arcLastX = event.clientX;
    this.pointer.arcLastY = event.clientY;
    this.pointer.arcStartX = event.clientX;
    this.pointer.arcStartY = event.clientY;

    // Capture starting quaternion from current display state
    this.pointer.arcStartQuat = this.state.displayCamQuat
      ?? this.state.camQuat
      ?? quaternionFromBasis(this.ensureInteractiveBasis());
    this.pointer.arcPrevQuat = [...this.pointer.arcStartQuat] as Quaternion;

    // Reset inertia and hit tracking
    this.pointer.arcInertiaAxis = null;
    this.pointer.arcInertiaSpeed = 0;
    this.pointer.arcHit = null;
    this.pointer.arcHitNormal = null;
    this.pointer.arcPendingPivot = null;
    // Pure arcball: no surface picking, no pivot shifting
    // Rotation always happens around the current camera target
  }

  /**
   * Process arcball rotation during drag.
   * Uses virtual sphere projection for intuitive 3D rotation.
   * Arcball allows FULL rotation freedom - no gimbal lock, no pole avoidance.
   */
  private processArcballOrbit(event: PointerEvent, dtSec: number): void {
    const vw = this.canvas.clientWidth || Math.max(1, this.canvas.width || 1);
    const vh = this.canvas.clientHeight || Math.max(1, this.canvas.height || 1);

    const anchorX = this.pointer.arcStartX;
    const anchorY = this.pointer.arcStartY;
    const currentX = event.clientX;
    const currentY = event.clientY;

    // Update tracking position
    this.pointer.arcLastX = currentX;
    this.pointer.arcLastY = currentY;

    // Compute arcball rotation from start to current position
    const { axis: arcAxisCam, angle: arcAngle } = sharedArcballDelta(
      anchorX, anchorY, currentX, currentY, vw, vh
    );

    // Skip tiny rotations to avoid numerical instability
    if (Math.abs(arcAngle) < 1e-6) return;

    // Get base quaternion for rotation
    const baseQuat = this.pointer.arcStartQuat ?? quaternionFromBasis(this.ensureInteractiveBasis());
    const startBasis = basisFromQuaternion(baseQuat);

    // Transform rotation axis from camera space to world space
    // Pure arcball rotation - no axis modification, no pivot shifting
    const axisWorld = cbCameraAxisToWorld(startBasis, arcAxisCam);
    if (!axisWorld) return;  // Invalid axis, skip

    // Apply rotation: deltaQuat * baseQuat
    const deltaQuat = quaternionFromAxisAngle(axisWorld, arcAngle);
    const nextQuat = multiplyQuaternions(deltaQuat, baseQuat);
    const rotated = basisFromQuaternion(nextQuat);

    // Update display state
    this.state.displayCamRight = [...rotated.right];
    this.state.displayCamUp = [...rotated.up];
    this.state.displayCamForward = [...rotated.forward];
    this.state.displayCamQuat = [...nextQuat] as Quaternion;

    // Sync Euler angles for compatibility with other systems
    const { rotX, rotY } = cbSyncAnglesFromBasis({
      right: rotated.right,
      up: rotated.up,
      forward: rotated.forward
    } as HelperCameraBasis);
    this.state.displayRotX = rotX;
    this.state.displayRotY = rotY;

    // Calculate inertia from frame-to-frame rotation
    this.updateArcballInertia(nextQuat, dtSec);

    this.state.cameraDirty = true;
  }

  /**
   * Update arcball inertia based on current rotation.
   * Called each frame during drag to track angular velocity.
   */
  private updateArcballInertia(nextQuat: Quaternion, dtSec: number): void {
    if (!this.pointer.arcPrevQuat) {
      this.pointer.arcPrevQuat = [...nextQuat] as Quaternion;
      return;
    }

    const prevQuat = this.pointer.arcPrevQuat;

    // Compute rotation delta from previous frame
    const deltaFrame = multiplyQuaternions(nextQuat, invertQuaternion(prevQuat));
    const { axis: inertiaAxis, angle: inertiaAngle } = axisAngleFromQuaternion(deltaFrame);

    if (inertiaAngle > 1e-5 && dtSec > 1e-4) {
      this.pointer.arcInertiaAxis = inertiaAxis;
      // Convert frame rotation to angular velocity (rad/sec)
      const rawSpeed = inertiaAngle / dtSec;
      // Blend with previous speed for smoother feel (exponential smoothing)
      const prevSpeed = this.pointer.arcInertiaSpeed || 0;
      this.pointer.arcInertiaSpeed = prevSpeed * 0.3 + rawSpeed * 0.7;
      // Clamp to prevent runaway inertia
      const maxSpeed = CameraController.MAX_ARC_INERTIA_SPEED;
      if (this.pointer.arcInertiaSpeed > maxSpeed) {
        this.pointer.arcInertiaSpeed = maxSpeed;
      }
    } else {
      // Don't zero out inertia on small movements - just decay it slightly
      // This preserves momentum from the last significant movement
      if (this.pointer.arcInertiaSpeed) {
        this.pointer.arcInertiaSpeed *= 0.9;
        if (Math.abs(this.pointer.arcInertiaSpeed) < 0.01) {
          this.pointer.arcInertiaSpeed = 0;
          this.pointer.arcInertiaAxis = null;
        }
      }
    }

    // Store current quat for next frame's delta calculation
    this.pointer.arcPrevQuat = [...nextQuat] as Quaternion;
  }

  /**
   * Transfer arcball inertia to state when releasing pointer.
   * Only transfers if there's meaningful angular velocity.
   */
  private transferArcballInertia(): void {
    if (!this.pointer.arcInertiaAxis || Math.abs(this.pointer.arcInertiaSpeed) < 0.01) {
      this.state.inertiaArcAxis = null;
      this.state.inertiaArcSpeed = 0;
      return;
    }

    this.state.inertiaArcAxis = [...this.pointer.arcInertiaAxis] as Vec3;
    this.state.inertiaArcSpeed = this.pointer.arcInertiaSpeed;
  }

  onPointerDown(event: PointerEvent) {
    // Commit any pending display state from previous interaction
    if (this.state.displayCamForward && this.state.displayCamUp && this.state.displayCamRight) {
      try {
        this.commitDisplayBasisToState();
      } catch (err) {
        /* best-effort commit */
      }
    }

    this.resetInertia();
    this.pointer.active = true;

    // Determine interaction mode based on button and modifiers
    // Right-click = pan, Middle-click = dolly, Modifiers + left = pan
    let mode: PointerMode = 'orbit';
    if (event.button === 2 || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) {
      mode = 'pan';
    } else if (event.button === 1) {
      mode = 'dolly';
    }

    this.pointer.mode = mode;
    this.pointer.lastX = event.clientX;
    this.pointer.lastY = event.clientY;
    this.markInteraction();

    // Initialize display basis from committed state
    this.state.displayCamRight = [...this.state.camRight];
    this.state.displayCamUp = [...this.state.camUp];
    this.state.displayCamForward = [...this.state.camForward];
    this.state.displayCamQuat = [...this.state.camQuat] as Quaternion;
    this.state.displayRotX = this.state.rotX;
    this.state.displayRotY = this.state.rotY;

    // Initialize arcball-specific state if in arcball mode
    if (this.state.cameraMode === 'arcball') {
      this.initArcballDrag(event, mode);
    } else {
      // For turntable mode, still initialize arcball tracking for potential mode switch
      this.pointer.arcLastX = event.clientX;
      this.pointer.arcLastY = event.clientY;
      this.pointer.arcStartX = event.clientX;
      this.pointer.arcStartY = event.clientY;
      this.pointer.arcStartQuat = null;
      this.pointer.arcPrevQuat = null;
      this.pointer.arcInertiaAxis = null;
      this.pointer.arcInertiaSpeed = 0;
      this.pointer.arcHit = null;
      this.pointer.arcHitNormal = null;
    }

    // Reset state-level inertia
    this.state.inertiaArcAxis = null;
    this.state.inertiaArcSpeed = 0;
  }

  onPointerRelease(): void {
    // Transfer arcball inertia before releasing
    if (this.state.cameraMode === 'arcball') {
      this.transferArcballInertia();
    }

    this.releasePointer();
    this.markInteraction();
    this.helpers.requestCameraEmitWhenStatic();
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.pointer.active) {
      return;
    }
    const now = performance.now();
    const lastTs = this.pointer.lastMoveTs ?? now;
    const dtSec = Math.max(1e-3, (now - lastTs) / 1000);
    this.pointer.lastMoveTs = now;
    const dx = event.clientX - this.pointer.lastX;
    const dy = event.clientY - this.pointer.lastY;
    this.pointer.lastX = event.clientX;
    this.pointer.lastY = event.clientY;
    if (this.pointer.mode === 'orbit') {
      const mode = this.state.cameraMode;
      if (mode === 'free') {
        if (event.shiftKey) {
          this.applyFreeLookPan(dx, dy);
        } else {
          this.applyFreeLookRotation(dx, dy);
        }
      } else if (mode === 'arcball') {
        // Arcball mode: ALWAYS use arcball orbit for left-click drag
        // Shift+drag in arcball mode still rotates (use right-click for pan)
        this.processArcballOrbit(event, dtSec);
      } else if (event.shiftKey) {
        // Turntable mode: Shift+drag pan - use camera axes for view-relative movement
        this.pointer.arcInertiaAxis = null;
        this.pointer.arcInertiaSpeed = 0;
        this.pointer.arcPrevQuat = null;
        const factor = this.computePanFactor(this.canvas);
        const basis = this.ensureInteractiveBasis();
        const camRight = basis.right;
        const camUp = basis.up;
        // Project camera right/up onto XY plane for panning
        const rightXY = Math.hypot(camRight[0], camRight[1]);
        const upXY = Math.hypot(camUp[0], camUp[1]);
        let worldDx = 0;
        let worldDy = 0;
        // Pan right (dx) along camera right axis projected to XY
        if (rightXY > 0.1) {
          worldDx += (camRight[0] / rightXY) * dx * factor;
          worldDy += (camRight[1] / rightXY) * dx * factor;
        } else {
          worldDx += dx * factor;
        }
        // Pan up (-dy) along camera up axis projected to XY
        if (upXY > 0.1) {
          worldDx -= (camUp[0] / upXY) * dy * factor;
          worldDy -= (camUp[1] / upXY) * dy * factor;
        } else {
          worldDy -= dy * factor;
        }
        this.state.panX += worldDx;
        this.state.panY += worldDy;
        // set pan velocity (world units per second)
        this.state.inertiaPanX = worldDx / dtSec * 0.45;
        this.state.inertiaPanY = worldDy / dtSec * 0.45;
        // clamp pan inertia to avoid runaway from rapid mouse moves or dt spikes
        const maxPan = CameraController.MAX_PAN_INERTIA_SPEED;
        if (Math.abs(this.state.inertiaPanX) > maxPan) this.state.inertiaPanX = Math.sign(this.state.inertiaPanX) * maxPan;
        if (Math.abs(this.state.inertiaPanY) > maxPan) this.state.inertiaPanY = Math.sign(this.state.inertiaPanY) * maxPan;
        this.updatePivotFromPan();
        this.state.cameraDirty = true;
      } else {
        // Turntable mode: standard orbit rotation
        this.pointer.arcInertiaAxis = null;
        this.pointer.arcInertiaSpeed = 0;
        this.pointer.arcPrevQuat = null;
        const vw = this.canvas.clientWidth || Math.max(1, this.canvas.width || 1);
        const vh = this.canvas.clientHeight || Math.max(1, this.canvas.height || 1);
        // Turntable drag mapping: convert pixel delta to yaw/pitch in radians
        // Sensitivity chosen to approximate prior free-look mapping but tuned for orbit feel
        const yawDelta = (-dx / Math.max(1, vw)) * 1.8 * Math.PI;
        const pitchDelta = (-dy / Math.max(1, vh)) * Math.PI;
        // For turntable, yaw should always be around WORLD_UP irrespective of camera roll
        const dYaw = this.state.cameraMode === 'turntable' ? yawDelta : (() => {
          const upDotWorld = (this.state.camUp && Array.isArray(this.state.camUp)) ? this.state.camUp[2] : 1;
          const invertOrbitX = upDotWorld >= 0;
          return yawDelta * (invertOrbitX ? +1 : -1);
        })();
        // If in turntable, apply turntableStep to preserve yaw around world-up and clamp pitch
        if (this.state.cameraMode === 'turntable') {
          const basis = this.ensureInteractiveBasis();
          // Preserve rotZ (tilt) during drag
          const currentRotZ = (this.state as any).displayRotZ ?? this.state.rotZ ?? 0;
          let { basis: nextBasis, rotX: nextRotX, rotY: nextRotY } = turntableStep(basis, dYaw, pitchDelta, currentRotZ);
          // Keep display basis upright: if the computed up vector flips negative
          // Z, mirror right/up like commitDisplayBasisToState to keep camera upright.
          if (nextBasis.up[2] < 0) {
            nextBasis = {
              right: [-nextBasis.right[0], -nextBasis.right[1], -nextBasis.right[2]],
              up: [-nextBasis.up[0], -nextBasis.up[1], -nextBasis.up[2]],
              forward: [...nextBasis.forward],
            };
          }
          this.state.displayCamRight = [...nextBasis.right];
          this.state.displayCamUp = [...nextBasis.up];
          this.state.displayCamForward = [...nextBasis.forward];
          this.state.displayCamQuat = quaternionFromBasis(nextBasis);
          this.state.displayRotX = nextRotX;
          this.state.displayRotY = nextRotY;
          // Compute inertia from the delta applied THIS FRAME (velocity = delta / time)
          // This gives proper angular velocity in rad/sec for smooth continuation
          this.state.inertiaRotY = (dYaw / dtSec) * 0.5;
          this.state.inertiaRotX = (pitchDelta / dtSec) * 0.5;
          // clamp rotation inertia magnitudes
          const maxRot = CameraController.MAX_ROT_INERTIA_SPEED;
          if (Math.abs(this.state.inertiaRotY) > maxRot) this.state.inertiaRotY = Math.sign(this.state.inertiaRotY) * maxRot;
          if (Math.abs(this.state.inertiaRotX) > maxRot) this.state.inertiaRotX = Math.sign(this.state.inertiaRotX) * maxRot;
          try { (this.state as any).recentInertia = { type: 'turntable', inertiaRotX: this.state.inertiaRotX, inertiaRotY: this.state.inertiaRotY, displayRotX: this.state.displayRotX, displayRotY: this.state.displayRotY, dt: dtSec, ts: Date.now() }; } catch (e) {/* best-effort */ }
        } else {
          // Default turntable-like mapping for other modes (orbit)
          // Ensure transient display angles exist
          if (this.state.displayRotX === null || this.state.displayRotY === null) {
            this.state.displayRotX = this.state.rotX;
            this.state.displayRotY = this.state.rotY;
          }
          this.state.displayRotY = (this.state.displayRotY as number) + dYaw;
          const pitchLimit = (typeof PITCH_SOFT_LIMIT === 'number') ? PITCH_SOFT_LIMIT : Math.PI * 0.5 - 0.009;
          this.state.displayRotX = clamp((this.state.displayRotX as number) + pitchDelta, -pitchLimit, pitchLimit);
          const inertiaBasis = applyCameraEulerToBasis(this.state.displayRotX as number, this.state.displayRotY as number);
          this.state.displayCamRight = [...inertiaBasis.right];
          this.state.displayCamUp = [...inertiaBasis.up];
          this.state.displayCamForward = [...inertiaBasis.forward];
          this.state.displayCamQuat = quaternionFromBasis(inertiaBasis);
          // Compute inertia from the delta applied THIS FRAME (velocity = delta / time)
          this.state.inertiaRotY = (dYaw / dtSec) * 0.5;
          this.state.inertiaRotX = (pitchDelta / dtSec) * 0.5;
        }
      }
    } else if (this.pointer.mode === 'pan') {
      if (this.state.cameraMode === 'free') {
        this.applyFreeLookPan(dx, dy);
      } else {
        // Pan along camera axes so movement is relative to current view
        const factor = this.computePanFactor(this.canvas);
        const basis = this.ensureInteractiveBasis();
        const camRight = basis.right;
        const camUp = basis.up;
        // Project camera right/up onto XY plane for panning
        const rightXY = Math.hypot(camRight[0], camRight[1]);
        const upXY = Math.hypot(camUp[0], camUp[1]);
        let worldDx = 0;
        let worldDy = 0;
        // Pan right (dx) along camera right axis projected to XY
        if (rightXY > 0.1) {
          worldDx += (camRight[0] / rightXY) * dx * factor;
          worldDy += (camRight[1] / rightXY) * dx * factor;
        } else {
          worldDx += dx * factor;
        }
        // Pan up (-dy, since screen Y is inverted) along camera up axis projected to XY
        if (upXY > 0.1) {
          worldDx -= (camUp[0] / upXY) * dy * factor;
          worldDy -= (camUp[1] / upXY) * dy * factor;
        } else {
          worldDy -= dy * factor;
        }
        this.state.panX += worldDx;
        this.state.panY += worldDy;
        // Compute inertia in world space
        this.state.inertiaPanX = worldDx / dtSec * 0.45;
        this.state.inertiaPanY = worldDy / dtSec * 0.45;
        // clamp pan inertia to a sensible maximum
        const maxPan2 = CameraController.MAX_PAN_INERTIA_SPEED;
        if (Math.abs(this.state.inertiaPanX) > maxPan2) this.state.inertiaPanX = Math.sign(this.state.inertiaPanX) * maxPan2;
        if (Math.abs(this.state.inertiaPanY) > maxPan2) this.state.inertiaPanY = Math.sign(this.state.inertiaPanY) * maxPan2;
        this.updatePivotFromPan();
        this.state.cameraDirty = true;
      }
    } else if (this.pointer.mode === 'dolly') {
      if (this.state.cameraMode === 'free') {
        this.applyFreeLookDolly(-dy);
      } else {
        // Apply dolly zoom based on vertical drag
        const factor = Math.exp(-dy * 0.005);
        const newZoom = this.helpers.clampZoomValue?.(this.state.zoom * factor) ?? this.state.zoom * factor;
        this.state.zoom = newZoom;
        this.state.inertiaRotX = 0;
        this.state.inertiaRotY = 0;
        this.state.cameraDirty = true;
      }
    }
    this.markInteraction();
    this.helpers.requestCameraEmitWhenStatic();
  }
}

export default CameraController;
