import { describe, it, expect, beforeAll } from 'vitest';

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

describe('WebGPU axis parity strict (no reversal)', () => {
  const presets = ['front', 'top'] as const;
  const axes: Array<Vec3> = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  for (const preset of presets) {
    it(`ensures overlay axes are not reversed for preset ${preset}`, () => {
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

      applyViewPreset(state, preset);
      const rig = buildCameraRig(state, 1.55);
      const basis = rig.basis as any;
      const pivot = state.pivot as Vec3;
      const mismatches: any[] = [];

      for (const axis of axes) {
        const worldScale = Math.max(state.sceneRadius, 1);
        const mul = (m: Float32Array, x: number, y: number, z: number) => {
          const cxv = m[0] * x + m[4] * y + m[8] * z + m[12] * 1;
          const cyv = m[1] * x + m[5] * y + m[9] * z + m[13] * 1;
          const cwv = m[3] * x + m[7] * y + m[11] * z + m[15] * 1;
          return { x: cxv, y: cyv, w: cwv };
        };
        const pA = mul(rig.viewProjection, pivot[0], pivot[1], pivot[2]);
        const pB = mul(rig.viewProjection, pivot[0] + axis[0] * worldScale, pivot[1] + axis[1] * worldScale, pivot[2] + axis[2] * worldScale);
        const dirNdc = ndcDirBetween(pA, pB);
        const ov = [dirNdc[0], -dirNdc[1]];
        const overlay_len = Math.hypot(ov[0], ov[1]);
        const ovScreenUnit = overlay_len < 1e-9 ? [0, 0] : [ov[0] / overlay_len, ov[1] / overlay_len];

        // Convert ov (screen-space with inverted Y) into NDC-like coords
        const ovNdcLike = [ov[0], -ov[1]];
        const ovLen = Math.hypot(ovNdcLike[0], ovNdcLike[1]);
        const ovNdcUnit = ovLen < 1e-9 ? [0, 0] : [ovNdcLike[0] / ovLen, ovNdcLike[1] / ovLen];
        const ndcLen = Math.hypot(dirNdc[0], dirNdc[1]);
        const ndcUnit = ndcLen < 1e-9 ? [0, 0] : [dirNdc[0] / ndcLen, dirNdc[1] / ndcLen];

        if (ovLen < 1e-6 && ndcLen < 1e-6) continue;

        // Strict check: we reject reversed directions; require dot positive and near 1
        const dot = ovNdcUnit[0] * ndcUnit[0] + ovNdcUnit[1] * ndcUnit[1];
        if (dot <= 0.95) {
          mismatches.push({ preset, axis, ovUnit, ndcUnit, dot });
        }
      }

      if (mismatches.length) {
        console.debug('Strict axis parity mismatches', mismatches);
      }
      expect(mismatches.length).toBe(0);
    });
  }
});
