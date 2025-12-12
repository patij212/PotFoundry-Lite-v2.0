import { describe, it, expect } from 'vitest';
import {
  arcballDelta,
  cameraAxisToWorld,
  basisFromQuaternion,
  quaternionFromAxisAngle,
  rotateBasisInPlace,
} from '../../../components/webgpu_component/frontend/src/camera_basis';

describe('arcball axis alignment', () => {
  it('uses the start basis to compute world axis (differs from current basis)', () => {
    const vw = 800;
    const vh = 600;
    const startX = 400;
    const startY = 300;
    // drag to the right
    const endX = startX + 40;
    const endY = startY;
    const { axis: arcAxisCam } = arcballDelta(startX, startY, endX, endY, vw, vh);

    // produce a start basis via quaternion (rotate 30deg about X)
    const startQuat = quaternionFromAxisAngle([1, 0, 0], Math.PI / 6);
    const startBasis = basisFromQuaternion(startQuat);

    // produce a different display (current) basis by rotating start by 60deg about Z
    const displayBasis = rotateBasisInPlace({ right: [...startBasis.right], up: [...startBasis.up], forward: [...startBasis.forward] }, [0, 0, 1], Math.PI / 3) as any;

    const axisWorldStart = cameraAxisToWorld(startBasis, arcAxisCam);
    const axisWorldDisplay = cameraAxisToWorld(displayBasis, arcAxisCam);

    // They must differ (not be equal) if the basis changed
    const nearlyEqual = (a: number[], b: number[], eps = 1e-6) => {
      return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= eps;
    };

    expect(nearlyEqual(axisWorldStart, axisWorldDisplay)).toBe(false);
    // However, axisWorldStart should be a unit vector (direction)
    const len = Math.hypot(axisWorldStart[0], axisWorldStart[1], axisWorldStart[2]);
    expect(Math.abs(len - 1)).toBeLessThan(1e-6);
  });
});
