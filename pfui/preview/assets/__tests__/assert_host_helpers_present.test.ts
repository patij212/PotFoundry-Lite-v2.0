/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

let __orig__pf_webgpu_camera_controller_desc: PropertyDescriptor | undefined;
import { assertHostHelpersPresent } from '../host_helpers';

describe('assertHostHelpersPresent function', () => {
  beforeEach(() => {
    __orig__pf_webgpu_camera_controller_desc = Object.getOwnPropertyDescriptor(window, '__pf_webgpu_camera_controller') as PropertyDescriptor | undefined;
    try { delete (window as any).__pf_webgpu_camera_controller; } catch (err) { /* ignore */ }
  });
  afterEach(() => {
    try {
      if (__orig__pf_webgpu_camera_controller_desc) {
        Object.defineProperty(window, '__pf_webgpu_camera_controller', __orig__pf_webgpu_camera_controller_desc);
      } else {
        try { delete (window as any).__pf_webgpu_camera_controller; } catch (err) { /* ignore */ }
      }
    } catch (err) { /* ignore restore errors */ }
  });
  it('returns true when host controller helpers present', () => {
    // Provide a full set of helper stubs expected by the assertion
    const helpersStub = {
      quaternionFromAxisAngle: () => [0, 0, 0, 1],
      multiplyQuaternions: () => [0, 0, 0, 1],
      invertQuaternion: () => [0, 0, 0, 1],
      axisAngleFromQuaternion: () => [1, 0, 0, 0],
      basisFromQuaternion: () => ({ forward: [0, 0, 1], up: [0, 1, 0], right: [1, 0, 0] }),
      cameraAxisToWorld: () => [0, 0, 1],
      syncAnglesFromBasis: () => ({ rotX: 0, rotY: 0, rotZ: 0 }),
    } as any;
    const stub = { helpers: helpersStub } as any;
    Object.defineProperty(window, '__pf_webgpu_camera_controller', { value: stub, writable: false, enumerable: true, configurable: true });
    expect(assertHostHelpersPresent()).toBe(true);
  });
  it('returns false when missing', () => {
    try { delete (window as any).__pf_webgpu_camera_controller; } catch (err) { /* ignore */ }
    expect(assertHostHelpersPresent()).toBe(false);
  });
});
