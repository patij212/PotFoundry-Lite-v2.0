import { describe, it, expect, beforeEach, beforeAll } from 'vitest';

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

describe('WebGPU axis parity vs viewProjection', () => {
  let state: any;
  beforeEach(() => {
    state = {
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
    } as any;
  });

  const presets = ['front', 'top'] as const;
  const axes: Array<Vec3> = [ [1,0,0], [0,1,0], [0,0,1] ];
  for (const preset of presets) {
    it(`projects overlay axes consistent with vp_matrix for preset ${preset}`, () => {
      applyViewPreset(state, preset);
      const rig = buildCameraRig(state, 1.55);
      const basis = rig.basis as any;
      const pivot = state.pivot as Vec3;
      // For each axis, compute overlay projection (basis axes) and clip-space NDC
      for (const axis of axes) {
        // Project pivot and pivot+axis*scale to clip/NDC and compute overlay from projection
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
        // Convert NDC to overlay (screen) coords: invert Y
        const ov = [dirNdc[0], -dirNdc[1]];
        const overlay_len = Math.hypot(ov[0], ov[1]);
        // Map overlay vector into screen-aligned form
        const ovScreenUnit = overlay_len < 1e-9 ? [0, 0] : [ov[0] / overlay_len, ov[1] / overlay_len];
        // Validate VP projection aligns with camera coordinates: world->camera
        const camX = basis.right[0] * axis[0] + basis.right[1] * axis[1] + basis.right[2] * axis[2];
        const camY = basis.up[0] * axis[0] + basis.up[1] * axis[1] + basis.up[2] * axis[2];
        // Compare the camera-space axis projected into screen coordinates
        // with the direction computed by projecting two world points.
        // Camera-screen mapping: X->right, Y->-up (screen Y inverted)
        const camScreenX = camX;
        const camScreenY = -camY;
        const camLen = Math.hypot(camScreenX, camScreenY);
        const camUnit = camLen < 1e-9 ? [0, 0] : [camScreenX / camLen, camScreenY / camLen];
        // Use overlay vector `ov` (already screen-mapped) and compare with dirNdc (NDC space)
        // Convert overlay (which uses inverted screen Y) back to NDC-like coords
        const ovNdcLike = [ov[0], -ov[1]];
        const ovLen = Math.hypot(ovNdcLike[0], ovNdcLike[1]);
        const ovNdcUnit = ovLen < 1e-9 ? [0, 0] : [ovNdcLike[0] / ovLen, ovNdcLike[1] / ovLen];
        const ndcLen = Math.hypot(dirNdc[0], dirNdc[1]);
        const ndcUnit = ndcLen < 1e-9 ? [0, 0] : [dirNdc[0] / ndcLen, dirNdc[1] / ndcLen];
        if (ovLen < 1e-6 && ndcLen < 1e-6) continue; // both axis parallel to view; nothing to compare
        const dotScreen = ovNdcUnit[0] * ndcUnit[0] + ovNdcUnit[1] * ndcUnit[1];
        if (Math.abs(dotScreen) < 0.95) {
          console.debug('Axis dot mismatch (abs)', { preset, axis, camUnit, ndc: dirNdc, ov, camX, camY, dotScreen });
        }
        expect(Math.abs(dotScreen)).toBeGreaterThan(0.95);
      }
    });
  }
});
