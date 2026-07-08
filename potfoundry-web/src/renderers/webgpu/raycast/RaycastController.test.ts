import { describe, it, expect, beforeEach } from 'vitest';
import { RaycastController } from './RaycastController';
import { VP_MATRIX_OFFSET } from '../../../camera_constants';
import { setupWebGPUMock } from '../../../test/webgpu-mock';

function makeUniforms(): Float32Array {
  const f = new Float32Array(76);
  f[0] = 100; // H
  // identity VP so invVP succeeds
  f[VP_MATRIX_OFFSET + 0] = 1; f[VP_MATRIX_OFFSET + 5] = 1;
  f[VP_MATRIX_OFFSET + 10] = 1; f[VP_MATRIX_OFFSET + 15] = 1;
  return f;
}

describe('RaycastController accumulation state', () => {
  let ctrl: RaycastController;
  let device: GPUDevice;
  beforeEach(async () => {
    setupWebGPUMock();
    const adapter = await navigator.gpu.requestAdapter();
    device = await adapter!.requestDevice();
    const buf = () => device.createBuffer({ size: 16, usage: 0x40 | 0x8 });
    ctrl = new RaycastController(device, 'bgra8unorm', {
      uniform: buf(), style: buf(),
      c1: buf(), c2: buf(), c3: buf(),
      bg1: buf(), bg2: buf(), bg3: buf(),
    });
  });

  // Drives one accumulation sample the way the real frame loop does:
  // notifyFrame() updates signature/reset state, encode() actually advances
  // sampleIndex (accumulation happens on the GPU timeline, not on notify).
  async function pumpFrame(f: Float32Array, w: number, h: number): Promise<void> {
    ctrl.setStyle(0);
    ctrl.notifyFrame(f, null, w, h);
    // Let setStyle's async pipeline compile resolve.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const encoder = device.createCommandEncoder();
    ctrl.encode(encoder, {} as GPUTextureView, {} as GPUTextureView);
  }

  it('needsFrame is true after a fresh notifyFrame', () => {
    ctrl.notifyFrame(makeUniforms(), null, 640, 480);
    expect(ctrl.needsFrame()).toBe(true);
  });

  it('unchanged uniforms advance the sample counter; change resets it', async () => {
    const f = makeUniforms();
    ctrl.setQuality({ maxSamples: 3 });
    await pumpFrame(f, 640, 480);      // sample 0
    await pumpFrame(f, 640, 480);      // sample 1
    await pumpFrame(f, 640, 480);      // sample 2
    await pumpFrame(f, 640, 480);      // converged
    expect(ctrl.needsFrame()).toBe(false);
    const g = makeUniforms();
    g[0] = 120; // H changed
    ctrl.notifyFrame(g, null, 640, 480);
    expect(ctrl.needsFrame()).toBe(true);
  });

  it('resize resets accumulation', async () => {
    const f = makeUniforms();
    ctrl.setQuality({ maxSamples: 1 });
    await pumpFrame(f, 640, 480);
    await pumpFrame(f, 640, 480);
    expect(ctrl.needsFrame()).toBe(false);
    ctrl.notifyFrame(f, null, 800, 600);
    expect(ctrl.needsFrame()).toBe(true);
  });

  it('isReady is false before setStyle compilation resolves', () => {
    expect(ctrl.isReady(0)).toBe(false);
  });
});
