import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CameraController } from '../camera_controller';
import * as cb from '../camera_basis';
import { applyViewPreset } from '../webgpu_core';
import * as CameraConstants from '../camera_constants';
import { applyCameraEulerToBasis } from '../camera_basis';
import type { WebGPUParams, CameraMode } from '../types';

const makeState = (): any => ({
  panX: 0,
  panY: 0,
  zoom: 1,
  orbitZoom: 1,
  cameraMode: 'arcball',
  displayCamRight: null,
  displayCamUp: null,
  displayCamForward: null,
  camRight: [1, 0, 0],
  camUp: [0, 0, 1],
  camForward: [0, -1, 0],
  camQuat: [0, 0, 0, 1],
  displayCamQuat: null,
  displayRotX: null,
  displayRotY: null,
  rotX: 0,
  rotY: 0,
  sceneRadius: 100,
  inertiaArcAxis: null,
  inertiaArcSpeed: 0,
  pivot: [0, 0, 0],
  targetPivot: null,
  autoPivotFromCamera: false,
  autoRotate: false,
  autoRotateSpeed: 0.3,
  autoRotateResumeAt: 0,
  freePosition: null,
  freeSpeed: 1,
  interacting: false,
  lastInteraction: 0,
  cameraDirty: false,
  disableAutoFlip: false,
});

const makeCanvas = () => ({
  clientWidth: 800,
  clientHeight: 600,
  width: 800,
  height: 600,
  getAttribute: (_: string) => 'pf-wgpu-default',
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
} as unknown as HTMLCanvasElement);

const makeHelpers = (state: any) => ({
  resolveInteractionRig: () => ({ cfg: {}, extents: { paddedHalfWidth: 150, paddedHalfHeight: 150, paddedMax: 150, paddingHint: 1.55 }, rig: {} }),
  ensureInteractiveBasis: (s: any) => ({ right: s.camRight, up: s.camUp, forward: s.camForward }),
  computePanFactor: () => 0.1,
  updatePivotFromPan: () => {},
  requestCameraEmitWhenStatic: () => {},
  markInteraction: () => {},
  worldRayFromCanvas: () => null,
  intersectRayZPlane: () => null,
  intersectRayCylinder: () => null,
  buildCameraRig: () => null,
  clampZoomValue: (v: number) => Math.max(0.25, Math.min(4.0, v)),
  cancelCameraEmit: () => {},
  setAutoRotate: () => {},
  setCameraMode: (mode: CameraMode) => {
    state.cameraMode = mode;
    state.useArcball = mode === 'arcball';
  },
  freeKeyboard: { activeKeys: new Set<string>(), boost: false },
});

describe('CameraController', () => {
  let state: any;
  let pointer: any;
  let canvas: HTMLCanvasElement;
  let helpers: any;
  let ctrl: CameraController;

  beforeEach(() => {
    state = makeState();
    pointer = {
      active: false,
      mode: 'orbit',
      lastX: 0,
      lastY: 0,
      arcLastX: 0,
      arcLastY: 0,
      arcStartX: 0,
      arcStartY: 0,
      arcStartQuat: null,
      arcPrevQuat: null,
      arcInertiaAxis: null,
      arcInertiaSpeed: 0,
    };
    canvas = makeCanvas();
    // ensure debug mount exists for the controller to write into
    (globalThis as any).__pf_webgpu_mounts = (globalThis as any).__pf_webgpu_mounts || {};
    (globalThis as any).__pf_webgpu_mounts['pf-wgpu-default'] = { debug: { ready: true, usedFallback: false, lastApplyCameraPayload: null, lastSceneRadiusUpdate: null, lastPayloadIsFullState: false } };
    helpers = makeHelpers(state);
    ctrl = new CameraController(state, pointer, canvas, helpers);
  });

  it('startFocusTween respects hitDepth when provided', () => {
    state.zone = {};
    state.panX = 0;
    state.panY = 0;
    state.zoom = 1;
    const t = ctrl.startFocusTween(10, 20, 1, 50);
    expect(t).not.toBeNull();
    // With paddedMax 150 and distance falloff 2.2 => 150*2.2/50 = 6.6, clamped to maxZoom 4.0 in controller
    expect(t!.targetZoom).toBeLessThanOrEqual(4.0);
  });

  it('startFocusTween computes and stores start/target quaternions for orientation tween', () => {
    // Set up a helpers.buildCameraRig that returns a different basis than current
    helpers.buildCameraRig = (_s: any, _p: number, _w?: number, _h?: number) => ({ eye: [0, 0, 100], viewProjection: new Float32Array(16), near: 0.1, far: 1000, basis: { right: [1, 0, 0], up: [0, 0, 1], forward: [0, 0, -1] } });
    const t = ctrl.startFocusTween(10, 20, 1, 50);
    expect(t).not.toBeNull();
    expect(t!.startQuat).toBeDefined();
    expect(t!.targetQuat).toBeDefined();
    // start quaternion from state camQuat and target quaternion derived from buildCameraRig basis
    expect(t!.startQuat).not.toEqual(t!.targetQuat);
  });

  it('startFocusTween cancels inertia to avoid continued motion', () => {
    // Set some inertia values to ensure they're cleared when focusing
    state.inertiaRotX = 1.0;
    state.inertiaRotY = 2.0;
    state.inertiaPanX = 3.0;
    state.inertiaPanY = 4.0;
    ctrl.startFocusTween(0, 0, 1);
    expect(state.inertiaRotX).toBe(0);
    expect(state.inertiaRotY).toBe(0);
    expect(state.inertiaPanX).toBe(0);
    expect(state.inertiaPanY).toBe(0);
  });

  it('releasePointer sets inertia when arcball drag exists', () => {
    pointer.mode = 'orbit';
    state.cameraMode = 'arcball';
    pointer.arcInertiaAxis = [1, 0, 0];
    pointer.arcInertiaSpeed = 10;
    const originalAxis = pointer.arcInertiaAxis;
    const originalSpeed = pointer.arcInertiaSpeed;
    ctrl.releasePointer();
    // inertiaArcAxis should be set on state with scaled speed; pointer cleared
    expect(state.inertiaArcAxis).toEqual(originalAxis);
    expect(state.inertiaArcSpeed).toBeCloseTo(originalSpeed * 0.35, 6);
  });

  it('releasePointer clamps arc inertia speed to max', () => {
    pointer.mode = 'orbit';
    state.cameraMode = 'arcball';
    pointer.arcInertiaAxis = [1, 0, 0];
    // very large raw speed to ensure clamping occurs
    pointer.arcInertiaSpeed = 1e6;
    ctrl.releasePointer();
    const raw = 1e6 * 0.35;
    const expected = Math.sign(raw) * Math.min(CameraController.MAX_ARC_INERTIA_SPEED, Math.abs(raw));
    expect(state.inertiaArcSpeed).toBeCloseTo(expected, 6);
  });

  it('onPointerDown initializes arcball state for arcball mode', () => {
    const event = { button: 0, clientX: 100, clientY: 100, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false } as unknown as PointerEvent;
    state.cameraMode = 'arcball';
    ctrl.onPointerDown(event);
    expect(pointer.active).toBeTruthy();
    expect(pointer.arcStartX).toBe(100);
    expect(pointer.arcStartY).toBe(100);
  });

  it('onPointerDown sets pivot/pan when clicking the pot', () => {
    // Setup a cylinder hit
    helpers.worldRayFromCanvas = (_rig: any, _canvas: HTMLCanvasElement, _x: number, _y: number) => ({ origin: [0, 0, 100], dir: [0, 0, -1] });
    helpers.intersectRayCylinder = (_ray: any, _radius: number, _minZ: number, _maxZ: number) => [10, -5, 0];
    state.cameraMode = 'arcball';
    const event = { button: 0, clientX: 100, clientY: 100, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false } as unknown as PointerEvent;
    ctrl.onPointerDown(event);
    expect(state.panX).toBeCloseTo(10, 6);
    expect(state.panY).toBeCloseTo(-5, 6);
    expect(state.pivot).toEqual([10, -5, 0]);
  });

  it('onPointerDown commits lingering display basis before starting a new drag', () => {
    state.cameraMode = 'turntable';
    state.autoPivotFromCamera = false;
    const event = { button: 0, clientX: 50, clientY: 60, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false } as unknown as PointerEvent;
    const basis = applyCameraEulerToBasis(0.3, 0.9);
    state.displayCamRight = [...basis.right];
    state.displayCamUp = [...basis.up];
    state.displayCamForward = [...basis.forward];
    state.displayRotX = 0.3;
    state.displayRotY = 0.9;
    state.inertiaRotX = 1.5;
    state.inertiaRotY = -0.2;
    state.inertiaPanX = 4;
    state.inertiaPanY = -3;
    state.inertiaArcAxis = [1, 0, 0];
    state.inertiaArcSpeed = 2;
    ctrl.onPointerDown(event);
    expect(state.camRight).toEqual(basis.right);
    expect(state.camUp).toEqual(basis.up);
    expect(state.camForward).toEqual(basis.forward);
    expect(state.rotX).toBeCloseTo(0.3, 6);
    expect(state.rotY).toBeCloseTo(0.9, 6);
    expect(state.displayCamRight).toEqual(basis.right);
    expect(state.inertiaRotX).toBe(0);
    expect(state.inertiaRotY).toBe(0);
    expect(state.inertiaPanX).toBe(0);
    expect(state.inertiaPanY).toBe(0);
    expect(state.inertiaArcAxis).toBeNull();
    expect(state.inertiaArcSpeed).toBe(0);
  });

  it('zoomCameraAtCursor pans to keep anchor under cursor', () => {
    // Provide helpers to simulate anchor before/after zoom
    // worldRayFromCanvas will incorporate rig.eye to vary anchors when rig changes
    helpers.worldRayFromCanvas = (rig: any, _canvas: HTMLCanvasElement, x: number, y: number) => ({ origin: [x + (rig?.eye?.[0] ?? 0), 0, 100], dir: [0, 0, -1] });
    helpers.intersectRayZPlane = (ray: any, z: number) => [ray.origin[0], 0, z];
    helpers.buildCameraRig = (_s: any, _p: number, _w?: number, _h?: number) => ({ eye: [10, 0, 100], viewProjection: new Float32Array(16), near: 0.1, far: 1000, basis: { right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, -1] } });
    state.panX = 0;
    state.panY = 0;
    // Zoom at cursor
    ctrl.zoomCameraAtCursor(100, 100, 2);
    // With anchor before/after, panX should adjust
    expect(state.panX).not.toBe(0);
  });

  it('applyFreeLookRotation updates display rot angles', () => {
    state.cameraMode = 'free';
    const initialRotX = state.displayRotX = 0;
    const initialRotY = state.displayRotY = 0;
    // rotate a bit
    ctrl.applyFreeLookRotation(10, 5);
    expect(state.displayRotX).not.toBe(initialRotX);
    expect(state.displayRotY).not.toBe(initialRotY);
  });

  it('turntable onPointerMove updates display angles', () => {
    state.cameraMode = 'turntable';
    pointer.active = true;
    pointer.lastX = 100;
    pointer.lastY = 100;
    state.displayRotX = 0;
    state.displayRotY = 0;
    const event = { clientX: 150, clientY: 120, button: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false } as unknown as PointerEvent;
    ctrl.onPointerMove(event);
    expect(state.displayRotX).not.toBe(0);
    expect(state.displayRotY).not.toBe(0);
  });

  it('turntable onPointerMove clamps rotation inertia magnitudes', () => {
    state.cameraMode = 'turntable';
    pointer.mode = 'orbit';
    pointer.active = true;
    pointer.lastX = 0;
    pointer.lastY = 0;
    // Provide extreme displayRot such that computed inertia would be extremely large
    state.displayRotX = 0;
    state.displayRotY = 1e6;
    state.rotX = 0;
    state.rotY = 0;
    // Force lastMoveTs to now - small so dtSec resolves to the minimum (~1e-3)
    pointer.lastMoveTs = performance.now() - 0.0005;
    const ev = { clientX: 0, clientY: 0, button: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false } as unknown as PointerEvent;
    ctrl.onPointerMove(ev);
    expect(Math.abs(state.inertiaRotY)).toBeLessThanOrEqual(CameraController.MAX_ROT_INERTIA_SPEED + 1e-6);
  });

  it('pan inertia clamps to max pan speed on large move', () => {
    state.cameraMode = 'turntable';
    pointer.mode = 'orbit';
    pointer.active = true;
    pointer.lastX = 0;
    pointer.lastY = 0;
    // Simulate a large pan delta: direct move
    pointer.lastMoveTs = performance.now() - 0.0005;
    const ev = { clientX: 1e6, clientY: 0, button: 0, shiftKey: true, altKey: false, ctrlKey: false, metaKey: false } as unknown as PointerEvent;
    ctrl.onPointerMove(ev);
    expect(Math.abs(state.inertiaPanX)).toBeLessThanOrEqual(CameraController.MAX_PAN_INERTIA_SPEED);
  });

  it('turntable yaw rotates about world-up and not invert when upside-down', () => {
    state.cameraMode = 'turntable';
    pointer.active = true;
    pointer.lastX = 100;
    pointer.lastY = 100;
    // Force a near-upside-down camera by clobbering camUp
    state.camUp = [0, 0, -1];
    state.displayCamRight = [1, 0, 0];
    state.displayCamUp = [0, 0, -1];
    state.displayCamForward = [0, 1, 0];
    state.displayRotX = 0.2;
    state.displayRotY = 0.0;
    const evA = { clientX: 120, clientY: 100, button: 0, shiftKey: false } as unknown as PointerEvent;
    ctrl.onPointerMove(evA);
    // After yaw, displayUp should still be aligned with WORLD_UP's Z component positive
    expect((state.displayCamUp as number[])[2]).toBeGreaterThan(0);
    // RotY should have advanced in sign (not inverted) relative to delta
    expect((state.displayRotY as number)).not.toBeCloseTo(0);
  });

  it('turntable does not invert horizontal drag when upside-down', () => {
    state.cameraMode = 'turntable';
    pointer.active = true;
    pointer.lastX = 100;
    pointer.lastY = 100;
    state.displayRotX = 0;
    state.displayRotY = 0;
    // Normal up
    state.camUp = [0, 0, 1];
    const evA = { clientX: 110, clientY: 100, button: 0, shiftKey: false } as unknown as PointerEvent;
    ctrl.onPointerMove(evA);
    const normalYaw = state.displayRotY as number;
    // Reset
    state.displayRotY = 0;
    pointer.lastX = 100;
    // Upside-down
    state.camUp = [0, 0, -1];
    const evB = { clientX: 110, clientY: 100, button: 0, shiftKey: false } as unknown as PointerEvent;
    ctrl.onPointerMove(evB);
    const upsideYaw = state.displayRotY as number;
    // For true turntable we expect no sign inversion (yaw sign unaffected)
    expect(Math.sign(upsideYaw)).toBe(Math.sign(normalYaw));
  });

  it('commitDisplayBasisToState does not flip for perpendicular basis right vectors', () => {
    // PrevRight is x-axis, display right is y-axis — perpendicular
    state.camRight = [1, 0, 0];
    state.displayCamRight = [0, 1, 0];
    state.displayCamUp = [0, 0, 1];
    state.displayCamForward = [0, -1, 0];
    const flipped = ctrl.commitDisplayBasisToState();
    expect(flipped).toBe(false);
    expect(state.camRight).toEqual([0, 1, 0]);
    expect(state.camUp).toEqual([0, 0, 1]);
    expect(state.camForward).toEqual([0, -1, 0]);
  });

  it('commitDisplayBasisToState flips when up vector Z component is negative', () => {
    // Flip behavior should apply for turntable/orbit modes
    state.cameraMode = 'turntable';
    state.camRight = [1, 0, 0];
    state.displayCamRight = [1, 0, 0];
    state.displayCamUp = [0, 0, -1];
    state.displayCamForward = [0, 1, 0];
    const flipped = ctrl.commitDisplayBasisToState();
    expect(flipped).toBe(true);
    expect(state.camUp[2]).toBeGreaterThan(0);
  });

  it('commitDisplayBasisToState does not flip when in arcball mode', () => {
    // Ensure arcball never flips basis automatically
    state.cameraMode = 'arcball';
    state.camRight = [1, 0, 0];
    state.displayCamRight = [-0.9999, 0, 0]; // nearly inverted
    state.displayCamUp = [0, 0, 1];
    state.displayCamForward = [0, -1, 0];
    const flipped = ctrl.commitDisplayBasisToState();
    expect(flipped).toBe(false);
    // camRight should be committed as-is (not flipped sign)
    const priorDisplay = [-0.9999, 0, 0];
    expect(state.camRight).toEqual(priorDisplay);
  });

  it('commitDisplayBasisToState respects disableAutoFlip and does not flip', () => {
    state.cameraMode = 'turntable';
    state.disableAutoFlip = true;
    state.camRight = [1, 0, 0];
    state.displayCamRight = [-0.9999, 0, 0]; // nearly inverted
    state.displayCamUp = [0, 0, -1];
    state.displayCamForward = [0, 1, 0];
    const flipped = ctrl.commitDisplayBasisToState();
    expect(flipped).toBe(false);
    // Up vector should remain negative because we didn't flip
    expect((state.camUp as number[])[2]).toBeLessThan(0);
  });

  it('commitDisplayBasisToState synchronizes rotX/rotY for turntable', () => {
    // Create a basis that matches the angles we want to commit
    const basis = applyCameraEulerToBasis(0.42, 1.23);
    state.displayCamRight = basis.right;
    state.displayCamUp = basis.up;
    state.displayCamForward = basis.forward;
    // Provide a display angle that should become committed
    state.displayRotX = 0.42;
    state.displayRotY = 1.23;
    const flipped = ctrl.commitDisplayBasisToState();
    expect(flipped).toBe(false);
    // Rotations should be in sync with display values after commit
    expect(state.rotX).toBeCloseTo(0.42, 3);
    expect(state.rotY).toBeCloseTo(1.23, 3);
  });

  // Flipping heuristic is replaced with deterministic canonicalization; the
  // display basis should be canonicalized rather than heuristically inverted.

  it('deferred forced payload is not applied after commit if values match for turntable', () => {
    state.cameraMode = 'turntable';
    // Initialize display basis and commit
    const base = applyCameraEulerToBasis(0.11, 0.55);
    state.displayCamRight = base.right;
    state.displayCamUp = base.up;
    state.displayCamForward = base.forward;
    state.displayRotX = 0.11;
    state.displayRotY = 0.55;
    ctrl.commitDisplayBasisToState();
    // Pretend a forced payload was queued during interaction and differs from older committed values
    const payload = { rotX: 0.11, rotY: 0.55, cameraNonce: 123 } as unknown as WebGPUParams;
    // Simulate local control just ended long ago so grace window has passed
    state.interacting = false;
    ctrl.localControlLastAt = Date.now() - 2000;
    // Set pending payload and attempt to apply deferred force
    ctrl.pendingForceCameraPayload = payload;
    ctrl.maybeApplyDeferredForceIfReady(Date.now());
    // The deferred forced payload should be cleared but not reapplied because values match
    expect(ctrl.pendingForceCameraPayload).toBeNull();
    expect(state.rotX).toBeCloseTo(0.11, 3);
    expect(state.rotY).toBeCloseTo(0.55, 3);
  });

  it('setPayload defers forced payload while interacting and applies after grace', () => {
    // Start interacting
    ctrl.markInteraction();
    // Apply a forced payload while interacting - this should be deferred
    const payload = { rotX: 1.23, rotY: 0.5, cameraNonce: 42 } as unknown as WebGPUParams;
    ctrl.setPayload(payload, { force: true });
    expect(ctrl.pendingForceCameraPayload).not.toBeNull();
    // End interaction and set localControlLastAt far in the past so grace has passed
    state.interacting = false;
    ctrl.localControlLastAt = Date.now() - 2000;
    // Now ask controller to apply deferred payload
    ctrl.maybeApplyDeferredForceIfReady(Date.now());
    expect(ctrl.pendingForceCameraPayload).toBeNull();
    // State rotX/rotY should be updated
    expect(state.rotX).toBeCloseTo(1.23, 3);
    expect(state.rotY).toBeCloseTo(0.5, 3);
  });

  it('setLocalCameraGraceMs shortens grace window applied when checking deferred payloads', () => {
    // Default is long; set to a small value and ensure deferred payload applies earlier
    ctrl.setLocalCameraGraceMs(100);
    ctrl.markInteraction();
    const payload = { rotX: 0.6, rotY: 0.7, cameraNonce: 666 } as unknown as WebGPUParams;
    ctrl.setPayload(payload, { force: true });
    expect(ctrl.pendingForceCameraPayload).not.toBeNull();
    // End interaction and set lastControl to long enough ago past the 100ms grace
    state.interacting = false;
    ctrl.localControlLastAt = Date.now() - 200;
    ctrl.maybeApplyDeferredForceIfReady(Date.now());
    expect(ctrl.pendingForceCameraPayload).toBeNull();
    expect(state.rotX).toBeCloseTo(0.6, 3);
    expect(state.rotY).toBeCloseTo(0.7, 3);
  });

  it('hostCameraAcceptPolicy strict prevents non-forced payloads', () => {
    // Set strict policy
    ctrl.setHostCameraAcceptPolicy('strict');
    const payload = { rotX: 0.21, rotY: 0.32 } as unknown as WebGPUParams;
    // Not forced: should be ignored
    ctrl.setPayload(payload, { force: false });
    expect(state.rotX).not.toBeCloseTo(0.21);
    expect(state.rotY).not.toBeCloseTo(0.32);
  });

  it('hostCameraAcceptPolicy always accepts non-forced payloads', () => {
    // Set always policy
    ctrl.setHostCameraAcceptPolicy('always');
    const payload = { rotX: 0.31, rotY: 0.42 } as unknown as WebGPUParams;
    // Should apply even without force
    ctrl.setPayload(payload, { force: false });
    expect(state.rotX).toBeCloseTo(0.31, 3);
    expect(state.rotY).toBeCloseTo(0.42, 3);
  });

  it('applyPayloadToState switches modes when payload requests arcball', () => {
    state.cameraMode = 'turntable';
    state.useArcball = false;
    ctrl.applyPayloadToState({ useArcball: true } as unknown as WebGPUParams, true);
    expect(state.cameraMode).toBe('arcball');
    expect(state.useArcball).toBe(true);
  });

  it('applyPayloadToState delegates cameraMode changes via helper when provided', () => {
    const setCameraMode = vi.fn();
    helpers.setCameraMode = setCameraMode;
    ctrl.applyPayloadToState({ cameraMode: 'turntable' } as unknown as WebGPUParams, true);
    expect(setCameraMode).toHaveBeenCalledWith('turntable');
  });

  it('applyPayloadToState realigns useArcball flag when mode already matches', () => {
    state.cameraMode = 'turntable';
    state.useArcball = true;
    ctrl.applyPayloadToState({ useArcball: false } as unknown as WebGPUParams, true);
    expect(state.useArcball).toBe(false);
    expect(state.cameraMode).toBe('turntable');
  });

  it('setPayload updates debug.lastApplyCameraPayload', () => {
    const payload = { rotX: 0.9, rotY: 1.1, cameraNonce: 100 } as unknown as WebGPUParams;
    // controller should record the last applied camera payload in debug
    ctrl.setPayload(payload, { force: true });
    // debug entry should be updated by setPayload/apply
    const dbg = (globalThis as any).__pf_webgpu_mounts['pf-wgpu-default']?.debug;
    expect(dbg).toBeDefined();
    expect(dbg.lastApplyCameraPayload).toBeDefined();
    expect(dbg.lastApplyCameraPayload.fields).toEqual(expect.arrayContaining(['rotX', 'rotY', 'cameraNonce']));
    expect(dbg.lastPayloadIsFullState).toBeTruthy();
  });

  it('maybeApplyDeferredForceIfReady writes debug when applying deferred payload', () => {
    // Simulate an interacting session and deferred payload
    ctrl.markInteraction();
    const payload = { rotX: 0.44, rotY: -0.22, cameraNonce: 222 } as unknown as WebGPUParams;
    ctrl.setPayload(payload, { force: true });
    expect(ctrl.pendingForceCameraPayload).not.toBeNull();
    // End interaction and move lastControl far in past so grace has passed
    state.interacting = false;
    ctrl.localControlLastAt = Date.now() - 2000;
    ctrl.maybeApplyDeferredForceIfReady(Date.now());
    const dbg = (globalThis as any).__pf_webgpu_mounts['pf-wgpu-default']?.debug;
    expect(dbg.lastApplyCameraPayload).toBeDefined();
    expect(dbg.lastApplyCameraPayload.fields).toEqual(expect.arrayContaining(['rotX', 'rotY', 'cameraNonce']));
    expect(dbg.lastPayloadIsFullState).toBeTruthy();
  });

  it('applyViewPreset top results in positive camUp y component (upright top view)', () => {
    applyViewPreset(state, 'top');
    expect((state.camUp as number[])[1]).toBeGreaterThanOrEqual(0);
  });

  it('commitDisplayBasisToState updates pivot from camera center when autoPivotFromCamera is true', () => {
    // Make helpers return a center-projecting ray that hits plane at z=0
    helpers.worldRayFromCanvas = (_rig: any, _canvas: HTMLCanvasElement, _x: number, _y: number) => ({ origin: [0, 0, 100], dir: [0, 0, -1] });
    helpers.intersectRayZPlane = (ray: any, z: number) => [10, 20, z];
    state.cameraMode = 'turntable';
    state.autoPivotFromCamera = true;
    state.displayCamRight = [1, 0, 0];
    state.displayCamUp = [0, 0, 1];
    state.displayCamForward = [0, -1, 0];
    ctrl.commitDisplayBasisToState();
    expect(state.pivot[0]).toBeCloseTo(10, 3);
    expect(state.pivot[1]).toBeCloseTo(20, 3);
    expect(state.panX).toBeCloseTo(10, 3);
    expect(state.panY).toBeCloseTo(20, 3);
  });

  it('commitDisplayBasisToState does not update pivot when autoPivotFromCamera is false', () => {
    helpers.worldRayFromCanvas = (_rig: any, _canvas: HTMLCanvasElement, _x: number, _y: number) => ({ origin: [0, 0, 100], dir: [0, 0, -1] });
    helpers.intersectRayZPlane = (ray: any, z: number) => [11, 22, z];
    state.cameraMode = 'turntable';
    state.autoPivotFromCamera = false;
    state.pivot = [0, 0, 0];
    state.panX = 0;
    state.panY = 0;
    state.displayCamRight = [1, 0, 0];
    state.displayCamUp = [0, 0, 1];
    state.displayCamForward = [0, -1, 0];
    ctrl.commitDisplayBasisToState();
    expect(state.pivot[0]).toBeCloseTo(0, 3);
    expect(state.pivot[1]).toBeCloseTo(0, 3);
    expect(state.panX).toBeCloseTo(0, 3);
    expect(state.panY).toBeCloseTo(0, 3);
  });

  it('focus tween defers forced payloads while active', () => {
    // Start focus tween and mark local interaction without cancelling focus tween
    ctrl.startFocusTween(5, 5, 1);
    ctrl.markInteraction(false);
    // Apply forced payload while focus tween active -- it should be deferred
    const payload = { rotX: 0.77, rotY: 0.88, cameraNonce: 555 } as unknown as WebGPUParams;
    ctrl.setPayload(payload, { force: true });
    expect(ctrl.pendingForceCameraPayload).not.toBeNull();
    // Cancel tween and ensure pending applied after grace
    ctrl.cancelFocusTween();
    state.interacting = false;
    ctrl.localControlLastAt = Date.now() - 2000;
    ctrl.maybeApplyDeferredForceIfReady(Date.now());
    expect(ctrl.pendingForceCameraPayload).toBeNull();
    expect(state.rotX).toBeCloseTo(0.77, 3);
    expect(state.rotY).toBeCloseTo(0.88, 3);
  });

  it('arcball axis projects onto hit tangent when interacting with pot', async () => {
    // Mock arcballDelta to emit a known camera-space axis so we can assert behavior
    vi.spyOn(cb as any, 'arcballDelta').mockImplementation(() => ({ axis: [Math.SQRT1_2, Math.SQRT1_2, 0], angle: 0.2 }));

    state = makeState();
    pointer = {
      active: false,
      mode: 'orbit',
      lastX: 0,
      lastY: 0,
      arcLastX: 0,
      arcLastY: 0,
      arcStartX: 0,
      arcStartY: 0,
      arcStartQuat: null,
      arcPrevQuat: null,
      arcInertiaAxis: null,
      arcInertiaSpeed: 0,
    };
    canvas = makeCanvas();
    helpers = makeHelpers(state);
    // Provide pick helpers to return a cylinder hit at x=10,y=0 so normal is [1,0,0]
    helpers.worldRayFromCanvas = (_rig: any, _canvas: HTMLCanvasElement, _x: number, _y: number) => ({ origin: [0, 0, 100], dir: [0, 0, -1] });
    helpers.intersectRayCylinder = (_ray: any, _radius: number, _minZ: number, _maxZ: number) => [10, 0, 0];
    const ctrl = new CameraController(state, pointer, canvas, helpers);

    // Start arcball drag
    state.cameraMode = 'arcball';
    const downEvent = { button: 0, clientX: 100, clientY: 100, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false } as unknown as PointerEvent;
    ctrl.onPointerDown(downEvent);
    expect(pointer.arcHit).toBeDefined();
    expect(pointer.arcHitNormal).toEqual([1, 0, 0]);

    // Move pointer (actual delta not important because arcballDelta is mocked)
    const moveEvent = { clientX: 110, clientY: 105, button: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false } as unknown as PointerEvent;
    ctrl.onPointerMove(moveEvent);
    // Compute delta frame quaternion between start and current display quat
    const baseQuat = pointer.arcStartQuat ?? cb.quaternionFromBasis(cb.applyCameraEulerToBasis(0, 0));
    const nextQuat = state.displayCamQuat as any as [number, number, number, number];
    const inv = cb.invertQuaternion(baseQuat);
    const deltaFrame = cb.multiplyQuaternions(nextQuat, inv);
    const { axis: axisDelta } = cb.axisAngleFromQuaternion(deltaFrame);
    // Axis should be orthogonal to hit normal (dot ≈ 0)
    const dot = axisDelta[0] * (pointer.arcHitNormal as number[])[0] + axisDelta[1] * (pointer.arcHitNormal as number[])[1] + axisDelta[2] * (pointer.arcHitNormal as number[])[2];
    expect(Math.abs(dot)).toBeLessThan(1e-5);
  });
});
