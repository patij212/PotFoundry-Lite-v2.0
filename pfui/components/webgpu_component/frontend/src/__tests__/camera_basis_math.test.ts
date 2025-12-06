import { describe, it, expect } from 'vitest';
import {
  quaternionFromAxisAngle,
  rotateVectorWithQuaternion,
  rotateVectorAroundAxis,
  slerpQuaternion,
  normalizeQuaternion,
  projectToSphere,
  cameraPayloadDiffers,
} from '../camera_basis';

describe('camera_basis math utilities', () => {
  it('slerp returns endpoints correctly', () => {
    const qA = normalizeQuaternion([0, 0, 0, 1]);
    const qB = normalizeQuaternion(quaternionFromAxisAngle([0, 0, 1], Math.PI / 2));
    const t0 = slerpQuaternion(qA, qB, 0);
    const t1 = slerpQuaternion(qA, qB, 1);
    expect(t0).toEqual(qA);
    expect(t1).toEqual(qB);
  });

  it('quaternion rotation matches axis-angle rotation for a vector', () => {
    const axis: [number, number, number] = [0, 0, 1];
    const angle = Math.PI / 2;
    const quat = quaternionFromAxisAngle(axis, angle);
    const v: [number, number, number] = [1, 0, 0];
    const rotatedByQuat = rotateVectorWithQuaternion(quat as any, v as any);
    const rotatedByAxis = rotateVectorAroundAxis(v as any, axis as any, angle as any);
    // Expect vector [0,1,0] (within tolerance)
    expect(Math.abs(rotatedByQuat[0])).toBeLessThan(1e-6);
    expect(rotatedByQuat[1]).toBeCloseTo(1, 6);
    expect(Math.abs(rotatedByQuat[2])).toBeLessThan(1e-6);
    expect(Math.abs(rotatedByAxis[0])).toBeLessThan(1e-6);
    expect(rotatedByAxis[1]).toBeCloseTo(1, 6);
  });

  it('projectToSphere maps center to a positive Z', () => {
    const w = 800;
    const h = 600;
    const res = projectToSphere(w / 2, h / 2, w, h, 1.0);
    expect(res[2]).toBeGreaterThan(0);
    expect(Math.abs(res[0])).toBeLessThan(1e-6);
    expect(Math.abs(res[1])).toBeLessThan(1e-6);
  });

  it('cameraPayloadDiffers tolerates tiny numeric noise', () => {
    const a = { rotX: 0.123456, rotY: -0.654321, zoom: 1.0, panX: 0, panY: 0 };
    const b = { rotX: 0.123456000001, rotY: -0.654321000002, zoom: 1.0, panX: 0, panY: 0 };
    expect(cameraPayloadDiffers(a, b, 1e-6)).toBe(false);
    expect(cameraPayloadDiffers(a, b, 1e-12)).toBe(true);
  });
});

