import { describe, it, expect } from 'vitest';
import { arcballDelta, cameraAxisToWorld, basisFromQuaternion, quaternionFromAxisAngle, multiplyQuaternions, basisFromQuaternion as bfq } from '../../../components/webgpu_component/frontend/src/camera_basis';

import { basisFromQuaternion as baseFromQuat } from '../../../components/webgpu_component/frontend/src/camera_basis';

describe('webgpu preview arcball quaternion generation', () => {
  it('computes next quaternion from start basis (differs from display basis)', () => {
    const vw = 800;
    const vh = 600;
    const startX = 400;
    const startY = 300;
    const endX = startX + 40;
    const endY = startY;
    const { axis: arcAxisCam, angle: arcAngle } = arcballDelta(startX, startY, endX, endY, vw, vh);

    const startQuat = quaternionFromAxisAngle([1, 0, 0], Math.PI / 6);
    const startBasis = basisFromQuaternion(startQuat);

    const displayQuat = quaternionFromAxisAngle([0, 0, 1], Math.PI / 3);
    const displayBasis = basisFromQuaternion(displayQuat);

    const axisWorldStart = cameraAxisToWorld(startBasis, arcAxisCam);
    const axisWorldDisplay = cameraAxisToWorld(displayBasis, arcAxisCam);

    const deltaStart = quaternionFromAxisAngle(axisWorldStart, arcAngle);
    const deltaDisplay = quaternionFromAxisAngle(axisWorldDisplay, arcAngle);

    const nextStart = multiplyQuaternions(deltaStart, startQuat);
    const nextDisplay = multiplyQuaternions(deltaDisplay, displayQuat);

    const nearlyEqual = (a: number[], b: number[], eps = 1e-6) => {
      return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]) <= eps;
    };

    expect(nearlyEqual(axisWorldStart, axisWorldDisplay)).toBe(false);
    expect(nearlyEqual(nextStart, nextDisplay)).toBe(false);
  });
});
