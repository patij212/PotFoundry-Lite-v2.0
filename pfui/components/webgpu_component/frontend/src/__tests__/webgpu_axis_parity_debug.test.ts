import { describe, it, beforeAll } from 'vitest';

let applyViewPreset: typeof import('../webgpu_core').applyViewPreset;
let buildCameraRig: typeof import('../webgpu_core').buildCameraRig;

beforeAll(async () => {
  (globalThis as any).window = globalThis as any;
  const module = await import('../webgpu_core');
  applyViewPreset = module.applyViewPreset;
  buildCameraRig = module.buildCameraRig;
});

type Vec3 = [number, number, number];
const mulMat4Vec4 = (m: Float32Array, x: number, y: number, z: number) => {
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12] * 1;
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13] * 1;
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15] * 1;
  return { x: cx, y: cy, w: cw };
};

const ndcDirBetween = (projA: { x: number; y: number; w: number }, projB: { x: number; y: number; w: number }) => {
  const ax = projA.x / projA.w;
  const ay = projA.y / projA.w;
  const bx = projB.x / projB.w;
  const by = projB.y / projB.w;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  return len < 1e-9 ? [0, 0] : [dx / len, dy / len];
};

describe('Debug axis parity', () => {
  it('front preset debug', () => {
    const state: any = {
      rotX: 0,
      rotY: 0,
      zoom: 1,
      panX: 0,
      panY: 0,
      pivot: [0, 0, 0],
      sceneRadius: 120,
      canvasAspect: 1.3333,
      projectionMode: 'perspective',
      cameraMode: 'turntable',
    };
    applyViewPreset(state, 'front');
    const rig = buildCameraRig(state, 1.55);
    const basis = rig.basis as any;
    const pivot = state.pivot as Vec3;
    const axis: Vec3 = [0, 0, 1];
    const scale = Math.max(state.sceneRadius, 1) * 1.0;
    // (Removed basis-derived overlay for tests) Compute overlay via projection (runtime method)

    // Projection-derived overlay (runtime method)
    const pA = mulMat4Vec4(rig.viewProjection, pivot[0], pivot[1], pivot[2]);
    const pB = mulMat4Vec4(rig.viewProjection, pivot[0] + axis[0] * scale, pivot[1] + axis[1] * scale, pivot[2] + axis[2] * scale);
    const dirNdc = ndcDirBetween(pA, pB);
    const ov = [dirNdc[0], -dirNdc[1]];
    const ovLen = Math.hypot(ov[0], ov[1]);
    const ovUnit = ovLen < 1e-9 ? [0, 0] : [ov[0] / ovLen, ov[1] / ovLen];

    console.log('basis', { right: basis.right, up: basis.up, forward: basis.forward });
    console.log('overlay (projection only)', { ov, ovUnit });
    console.log('ndc', { dirNdc });
    console.log('viewProjection', Array.from(rig.viewProjection));
  });
});
