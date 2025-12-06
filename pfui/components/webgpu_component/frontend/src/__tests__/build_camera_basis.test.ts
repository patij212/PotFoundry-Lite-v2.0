import { describe, it, expect } from 'vitest';
import { buildCameraRig, applyViewPreset } from '../webgpu_core';

const makeState = (): any => ({
  rotX: 0.35,
  rotY: 0,
  rotZ: 0,
  autoRotate: false,
  cameraMode: 'turntable',
  zoom: 1,
  orbitZoom: 1,
  panX: 0,
  panY: 0,
  inertiaRotX: 0,
  inertiaRotY: 0,
  inertiaPanX: 0,
  inertiaPanY: 0,
  inertiaArcAxis: null,
  inertiaArcSpeed: 0,
  interacting: false,
  lastInteraction: 0,
  sceneRadius: 120,
  zone: {},
  interactiveLodRatio: 0.45,
  interactiveLodEnabled: false,
  recentParamUpdate: false,
  lastParamUpdate: 0,
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
  freePosition: [0, -240, 80],
  freeSpeed: 1.0,
});

describe('buildCameraRig top presets', () => {
  it('top preset yields upright basis (up y >= 0) in rig', () => {
    const state = makeState();
    applyViewPreset(state, 'top');
    const rig = buildCameraRig(state, 1.55, 150, 150);
    expect(rig.basis.up[1]).toBeGreaterThanOrEqual(0);
  });
  it('front preset yields forward -Y and upright up.z > 0', () => {
    const state = makeState();
    applyViewPreset(state, 'front');
    const rig = buildCameraRig(state, 1.55, 150, 150);
    expect(rig.basis.forward[0]).toBeCloseTo(0, 6);
    expect(rig.basis.forward[1]).toBeLessThan(0);
    expect(rig.basis.up[2]).toBeGreaterThan(0);
  });
  it('right preset yields forward -X and upright up.z > 0', () => {
    const state = makeState();
    applyViewPreset(state, 'right');
    // debug
    // eslint-disable-next-line no-console
    console.debug('right preset state', { rotX: state.rotX, rotY: state.rotY, camForward: state.camForward, displayCamForward: state.displayCamForward });
    const rig = buildCameraRig(state, 1.55, 150, 150);
    // Debugging info in case of failure
    // eslint-disable-next-line no-console
    console.debug('right preset basis', { forward: rig.basis.forward, up: rig.basis.up, right: rig.basis.right });
    expect(rig.basis.forward[0]).toBeLessThan(0);
    expect(Math.abs(rig.basis.forward[1])).toBeLessThan(1e-6);
    expect(rig.basis.up[2]).toBeGreaterThan(0);
  });
  it('fit preset yields proper upright view', () => {
    const state = makeState();
    applyViewPreset(state, 'fit');
    const rig = buildCameraRig(state, 1.55, 150, 150);
    expect(rig.basis.up[2]).toBeGreaterThan(0);
  });

  it('buildCameraRig uses state.display* basis when provided', () => {
    const state = makeState();
    // Provide an explicit display basis that does not match default
    state.displayCamForward = [-1, 0, 0];
    state.displayCamRight = [0, -1, 0];
    state.displayCamUp = [0, 0, 1];
    const rig = buildCameraRig(state, 1.55, 150, 150);
    expect(rig.basis.forward[0]).toBeLessThan(0);
    expect(Math.abs(rig.basis.forward[1])).toBeLessThan(1e-6);
    expect(rig.basis.up[2]).toBeGreaterThan(0);
  });
});
