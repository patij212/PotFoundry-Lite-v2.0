import { describe, it, expect, beforeAll } from 'vitest';

type Vec3 = [number, number, number];

type Hooks = {
  applyCameraEuler: (state: any, rotX: number, rotY: number) => void;
};

let buildCameraRig: typeof import('../webgpu_core').buildCameraRig;
let overlayForAxisFromBasis: typeof import('../webgpu_core').overlayForAxisFromBasis;
let applyCameraEuler: Hooks['applyCameraEuler'];

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

beforeAll(async () => {
  (globalThis as any).window = globalThis as any;
  const module = await import('../webgpu_core');
  buildCameraRig = module.buildCameraRig;
  overlayForAxisFromBasis = module.overlayForAxisFromBasis;
  const hooks = module.__axisParityTestHooks;
  applyCameraEuler = hooks.applyCameraEuler;
});

describe('Axis overlay parity across camera angles', () => {
  const pitches = [-1.2, -0.75, -0.3, 0, 0.35, 0.9, 1.2];
  const yaws = [-Math.PI, -Math.PI / 2, -Math.PI / 3, 0, Math.PI / 3, Math.PI / 2, Math.PI];
  const axes: Array<Vec3> = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  it('keeps overlay directions consistent with projection', () => {
    for (const rotX of pitches) {
      for (const rotY of yaws) {
        const state: any = {
          rotX,
          rotY,
          zoom: 1,
          panX: 0,
          panY: 0,
          pivot: [0, 0, 0],
          sceneRadius: 120,
          canvasAspect: 1.3333,
          projectionMode: 'perspective',
          cameraMode: 'turntable',
          camRight: [1, 0, 0],
          camUp: [0, 0, 1],
          camForward: [0, -1, 0],
        };
        applyCameraEuler(state, rotX, rotY);
        state.displayCamRight = [...state.camRight];
        state.displayCamUp = [...state.camUp];
        state.displayCamForward = [...state.camForward];
        const rig = buildCameraRig(state, 1.55);
        const pivot = state.pivot as Vec3;
        const worldScale = Math.max(state.sceneRadius, 1);
        for (const axis of axes) {
          const pA = mulMat4Vec4(rig.viewProjection, pivot[0], pivot[1], pivot[2]);
          const pB = mulMat4Vec4(
            rig.viewProjection,
            pivot[0] + axis[0] * worldScale,
            pivot[1] + axis[1] * worldScale,
            pivot[2] + axis[2] * worldScale
          );
          const dirNdc = ndcDirBetween(pA, pB);
          const ovProj2d = [dirNdc[0], -dirNdc[1]];
          const projLen = Math.hypot(ovProj2d[0], ovProj2d[1]);
          if (projLen < 1e-6) {
            continue;
          }
          const projUnit = [ovProj2d[0] / projLen, ovProj2d[1] / projLen];
          const ovBasis = overlayForAxisFromBasis(rig, rig.basis as any, axis, pivot, worldScale);
          const ovLen = Math.hypot(ovBasis[0], ovBasis[1]);
          if (ovLen < 1e-6) {
            continue;
          }
          const ovUnit = [ovBasis[0] / ovLen, ovBasis[1] / ovLen];
          const dot = ovUnit[0] * projUnit[0] + ovUnit[1] * projUnit[1];
          expect(Math.abs(dot)).toBeGreaterThan(0.97);
        }
      }
    }
  });
});
