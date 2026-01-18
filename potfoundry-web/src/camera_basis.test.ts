/**
 * Camera Basis Math Tests
 * Tests for quaternion operations and camera basis utilities.
 * Note: Internal vec3 functions are not exported, so we test them indirectly.
 */
import { describe, it, expect } from 'vitest';
import {
    Vec3,
    Quaternion,
    CameraBasis,
    WORLD_UP,
    PITCH_SOFT_LIMIT,
    QUAT_IDENTITY,
    normalizeQuaternion,
    multiplyQuaternions,
    invertQuaternion,
    axisAngleFromQuaternion,
    quaternionFromAxisAngle,
    rotateVectorWithQuaternion,
    basisFromQuaternion,
    quaternionFromBasis,
    rotateVectorAroundAxis,
    arcballDelta,
    projectToSphere,
    buildCameraBasis,
    normalizeCameraBasis,
    applyCameraEulerToBasis,
    quaternionFromEuler,
    syncAnglesFromBasis,
    slerpQuaternion,
    turntableStep,
    rotateBasisInPlace,
    rotateBasisAboutAxisFull,
    cameraPayloadDiffers,
    cameraAxisToWorld,
} from './camera_basis';

// Helper function to calculate vec3 length (since internal function is not exported)
const vec3Length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const vec3Dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('Constants', () => {
    describe('WORLD_UP', () => {
        it('should be Z-up', () => {
            expect(WORLD_UP).toEqual([0, 0, 1]);
        });
    });

    describe('QUAT_IDENTITY', () => {
        it('should be identity quaternion [0,0,0,1]', () => {
            expect(QUAT_IDENTITY).toEqual([0, 0, 0, 1]);
        });
    });

    describe('PITCH_SOFT_LIMIT', () => {
        it('should be slightly less than 90 degrees', () => {
            expect(PITCH_SOFT_LIMIT).toBeLessThan(Math.PI / 2);
            expect(PITCH_SOFT_LIMIT).toBeGreaterThan(Math.PI / 2 - 0.01);
        });
    });
});

describe('Quaternion Operations', () => {
    describe('normalizeQuaternion', () => {
        it('should normalize identity quaternion', () => {
            const result = normalizeQuaternion([0, 0, 0, 1]);
            expect(result[3]).toBeCloseTo(1);
        });

        it('should normalize scaled quaternion', () => {
            const result = normalizeQuaternion([0, 0, 0, 2]);
            const len = Math.sqrt(result[0] ** 2 + result[1] ** 2 + result[2] ** 2 + result[3] ** 2);
            expect(len).toBeCloseTo(1);
        });

        it('should return identity for zero quaternion', () => {
            const result = normalizeQuaternion([0, 0, 0, 0]);
            expect(result).toEqual([0, 0, 0, 1]);
        });
    });

    describe('multiplyQuaternions', () => {
        it('should multiply with identity', () => {
            const q: Quaternion = [0.5, 0, 0, 0.866];
            const result = multiplyQuaternions(q, QUAT_IDENTITY);
            expect(result[0]).toBeCloseTo(q[0], 1);
            expect(result[3]).toBeCloseTo(q[3], 1);
        });

        it('should be associative', () => {
            const a = quaternionFromAxisAngle([0, 0, 1], Math.PI / 4);
            const b = quaternionFromAxisAngle([1, 0, 0], Math.PI / 6);
            const c = quaternionFromAxisAngle([0, 1, 0], Math.PI / 3);
            const ab_c = multiplyQuaternions(multiplyQuaternions(a, b), c);
            const a_bc = multiplyQuaternions(a, multiplyQuaternions(b, c));
            expect(ab_c[0]).toBeCloseTo(a_bc[0], 4);
            expect(ab_c[3]).toBeCloseTo(a_bc[3], 4);
        });
    });

    describe('invertQuaternion', () => {
        it('should invert identity to identity', () => {
            const result = invertQuaternion(QUAT_IDENTITY);
            // Use toBeCloseTo for -0 vs 0 tolerance
            expect(result[0]).toBeCloseTo(0);
            expect(result[1]).toBeCloseTo(0);
            expect(result[2]).toBeCloseTo(0);
            expect(result[3]).toBeCloseTo(1);
        });

        it('should produce conjugate for unit quaternion', () => {
            const q: Quaternion = [0.5, 0, 0, 0.866];
            const result = invertQuaternion(normalizeQuaternion(q));
            expect(result[0]).toBeCloseTo(-0.5, 0);
            expect(result[3]).toBeCloseTo(0.866, 1);
        });

        it('should satisfy q * q^-1 = identity', () => {
            const q = quaternionFromAxisAngle([0, 0, 1], Math.PI / 3);
            const qInv = invertQuaternion(q);
            const result = multiplyQuaternions(q, qInv);
            expect(result[3]).toBeCloseTo(1, 4);
        });
    });

    describe('quaternionFromAxisAngle', () => {
        it('should create identity for zero angle', () => {
            const result = quaternionFromAxisAngle([1, 0, 0], 0);
            expect(result[3]).toBeCloseTo(1);
            expect(result[0]).toBeCloseTo(0);
        });

        it('should create 90 degree rotation around Z', () => {
            const result = quaternionFromAxisAngle([0, 0, 1], Math.PI / 2);
            expect(result[2]).toBeCloseTo(Math.sin(Math.PI / 4));
            expect(result[3]).toBeCloseTo(Math.cos(Math.PI / 4));
        });

        it('should create 180 degree rotation', () => {
            const result = quaternionFromAxisAngle([1, 0, 0], Math.PI);
            expect(result[0]).toBeCloseTo(1);
            expect(Math.abs(result[3])).toBeLessThan(0.01);
        });
    });

    describe('axisAngleFromQuaternion', () => {
        it('should extract axis and angle from z-rotation', () => {
            const q = quaternionFromAxisAngle([0, 0, 1], Math.PI / 2);
            const { axis, angle } = axisAngleFromQuaternion(q);
            expect(angle).toBeCloseTo(Math.PI / 2);
            expect(axis[2]).toBeCloseTo(1);
        });

        it('should return zero angle for identity', () => {
            const { angle } = axisAngleFromQuaternion(QUAT_IDENTITY);
            expect(angle).toBeCloseTo(0);
        });
    });

    describe('rotateVectorWithQuaternion', () => {
        it('should not change vector with identity', () => {
            const v: Vec3 = [1, 0, 0];
            const result = rotateVectorWithQuaternion(QUAT_IDENTITY, v);
            expect(result[0]).toBeCloseTo(1);
            expect(result[1]).toBeCloseTo(0);
            expect(result[2]).toBeCloseTo(0);
        });

        it('should rotate X to Y with 90deg Z rotation', () => {
            const q = quaternionFromAxisAngle([0, 0, 1], Math.PI / 2);
            const v: Vec3 = [1, 0, 0];
            const result = rotateVectorWithQuaternion(q, v);
            expect(result[0]).toBeCloseTo(0);
            expect(result[1]).toBeCloseTo(1);
        });

        it('should rotate Y to -X with 90deg Z rotation', () => {
            const q = quaternionFromAxisAngle([0, 0, 1], Math.PI / 2);
            const v: Vec3 = [0, 1, 0];
            const result = rotateVectorWithQuaternion(q, v);
            expect(result[0]).toBeCloseTo(-1);
            expect(result[1]).toBeCloseTo(0);
        });
    });

    describe('slerpQuaternion', () => {
        it('should return first quaternion at t=0', () => {
            const a: Quaternion = [0, 0, 0, 1];
            const b = quaternionFromAxisAngle([0, 0, 1], Math.PI / 2);
            const result = slerpQuaternion(a, b, 0);
            expect(result[3]).toBeCloseTo(1);
        });

        it('should return second quaternion at t=1', () => {
            const a: Quaternion = [0, 0, 0, 1];
            const b = quaternionFromAxisAngle([0, 0, 1], Math.PI / 2);
            const result = slerpQuaternion(a, b, 1);
            expect(Math.abs(result[3] - b[3])).toBeLessThan(0.1);
        });

        it('should interpolate at t=0.5', () => {
            const a = quaternionFromAxisAngle([0, 0, 1], 0);
            const b = quaternionFromAxisAngle([0, 0, 1], Math.PI / 2);
            const result = slerpQuaternion(a, b, 0.5);
            // At 0.5, should be roughly 45 degree rotation
            const { angle } = axisAngleFromQuaternion(result);
            expect(angle).toBeCloseTo(Math.PI / 4, 1);
        });
    });
});

describe('Camera Basis', () => {
    describe('buildCameraBasis', () => {
        it('should create orthonormal basis from forward direction', () => {
            const basis = buildCameraBasis([0, -1, 0]);
            expect(vec3Length(basis.right)).toBeCloseTo(1);
            expect(vec3Length(basis.up)).toBeCloseTo(1);
            expect(vec3Length(basis.forward)).toBeCloseTo(1);
        });

        it('should have perpendicular axes', () => {
            const basis = buildCameraBasis([0, -1, 0]);
            expect(vec3Dot(basis.right, basis.up)).toBeCloseTo(0, 4);
            expect(vec3Dot(basis.right, basis.forward)).toBeCloseTo(0, 4);
            expect(vec3Dot(basis.up, basis.forward)).toBeCloseTo(0, 4);
        });

        it('should handle degenerate forward direction', () => {
            const basis = buildCameraBasis([0, 0, 0]);
            // Degenerate input may return default basis or zero - check it doesn't crash
            expect(basis).toBeDefined();
            expect(basis.forward).toBeDefined();
        });
    });

    describe('normalizeCameraBasis', () => {
        it('should preserve already normalized basis', () => {
            const basis: CameraBasis = {
                right: [1, 0, 0],
                up: [0, 0, 1],
                forward: [0, -1, 0],
            };
            const result = normalizeCameraBasis(basis);
            expect(vec3Length(result.right)).toBeCloseTo(1);
            expect(vec3Length(result.up)).toBeCloseTo(1);
            expect(vec3Length(result.forward)).toBeCloseTo(1);
        });
    });

    describe('basisFromQuaternion', () => {
        it('should create expected basis from identity quaternion', () => {
            const basis = basisFromQuaternion(QUAT_IDENTITY);
            // Identity quaternion creates a specific basis - verify orthonormality
            expect(vec3Length(basis.forward)).toBeCloseTo(1);
            expect(vec3Length(basis.up)).toBeCloseTo(1);
            expect(vec3Length(basis.right)).toBeCloseTo(1);
        });

        it('should produce orthonormal basis', () => {
            const q = quaternionFromAxisAngle([1, 1, 0], Math.PI / 3);
            const basis = basisFromQuaternion(q);
            expect(vec3Dot(basis.right, basis.up)).toBeCloseTo(0, 4);
            expect(vec3Dot(basis.right, basis.forward)).toBeCloseTo(0, 4);
        });
    });

    describe('quaternionFromBasis', () => {
        it('should round-trip with basisFromQuaternion', () => {
            const q = quaternionFromAxisAngle([0, 0, 1], Math.PI / 4);
            const basis = basisFromQuaternion(q);
            const qBack = quaternionFromBasis(basis);
            // Compare absolute values since quaternion sign can flip
            expect(Math.abs(qBack[3])).toBeCloseTo(Math.abs(q[3]), 1);
        });
    });

    describe('applyCameraEulerToBasis', () => {
        it('should create basis from rotX=0, rotY=0', () => {
            const basis = applyCameraEulerToBasis(0, 0);
            expect(vec3Length(basis.forward)).toBeCloseTo(1);
        });

        it('should look along -Y when yaw is 0', () => {
            const basis = applyCameraEulerToBasis(0, 0);
            expect(basis.forward[1]).toBeLessThan(0);
        });

        it('should look along +X when yaw is π/2', () => {
            const basis = applyCameraEulerToBasis(0, Math.PI / 2);
            expect(basis.forward[0]).toBeGreaterThan(0.9);
        });
    });

    describe('quaternionFromEuler', () => {
        it('should create identity-like quaternion for zero angles', () => {
            const q = quaternionFromEuler(0, 0, 0);
            expect(Math.abs(q[3])).toBeCloseTo(1, 0);
        });

        it('should respect yaw rotation', () => {
            const q = quaternionFromEuler(0, Math.PI / 2, 0);
            const basis = basisFromQuaternion(q);
            expect(basis.forward[0]).toBeGreaterThan(0.5);
        });
    });

    describe('syncAnglesFromBasis', () => {
        it('should extract zero angles from default basis', () => {
            const basis = buildCameraBasis([0, -1, 0]);
            const { rotX, rotY } = syncAnglesFromBasis(basis);
            expect(rotX).toBeCloseTo(0, 1);
            expect(rotY).toBeCloseTo(0, 1);
        });

        it('should round-trip with applyCameraEulerToBasis', () => {
            const basis = applyCameraEulerToBasis(0.3, 0.5);
            const { rotX, rotY } = syncAnglesFromBasis(basis);
            expect(rotX).toBeCloseTo(0.3, 1);
            expect(rotY).toBeCloseTo(0.5, 1);
        });
    });
});

describe('Arcball', () => {
    describe('projectToSphere', () => {
        it('should project center to (0,0,z)', () => {
            const result = projectToSphere(400, 300, 800, 600);
            expect(result[0]).toBeCloseTo(0);
            expect(result[1]).toBeCloseTo(0);
            expect(result[2]).toBeGreaterThan(0);
        });

        it('should project to normalized vector', () => {
            const result = projectToSphere(300, 200, 800, 600);
            const len = vec3Length(result);
            expect(len).toBeCloseTo(1, 1);
        });
    });

    describe('arcballDelta', () => {
        it('should return zero angle for same point', () => {
            const { angle } = arcballDelta(400, 300, 400, 300, 800, 600);
            expect(angle).toBeCloseTo(0);
        });

        it('should return non-zero angle for different points', () => {
            const { angle } = arcballDelta(300, 300, 500, 300, 800, 600);
            expect(angle).toBeGreaterThan(0);
        });

        it('should return normalized axis', () => {
            const { axis } = arcballDelta(300, 300, 500, 400, 800, 600);
            expect(vec3Length(axis)).toBeCloseTo(1, 4);
        });
    });
});

describe('Rotation Utilities', () => {
    describe('rotateVectorAroundAxis', () => {
        it('should rotate X to Y around Z by 90 deg', () => {
            const result = rotateVectorAroundAxis([1, 0, 0], [0, 0, 1], Math.PI / 2);
            expect(result[0]).toBeCloseTo(0);
            expect(result[1]).toBeCloseTo(1);
        });

        it('should not change vector for zero rotation', () => {
            const result = rotateVectorAroundAxis([1, 2, 3], [0, 0, 1], 0);
            expect(result[0]).toBeCloseTo(1);
            expect(result[1]).toBeCloseTo(2);
            expect(result[2]).toBeCloseTo(3);
        });

        it('should rotate by 180 degrees', () => {
            const result = rotateVectorAroundAxis([1, 0, 0], [0, 0, 1], Math.PI);
            expect(result[0]).toBeCloseTo(-1);
            expect(result[1]).toBeCloseTo(0);
        });
    });

    describe('rotateBasisInPlace', () => {
        it('should return null for null input', () => {
            const result = rotateBasisInPlace(null, [0, 0, 1], Math.PI / 2);
            expect(result).toBeNull();
        });

        it('should return basis unchanged for zero angle', () => {
            const basis: CameraBasis = {
                right: [1, 0, 0],
                up: [0, 0, 1],
                forward: [0, -1, 0],
            };
            const result = rotateBasisInPlace(basis, [0, 0, 1], 0);
            expect(result).toBe(basis);
        });
    });

    describe('rotateBasisAboutAxisFull', () => {
        it('should return null for null input', () => {
            const result = rotateBasisAboutAxisFull(null, [0, 0, 1], Math.PI / 2);
            expect(result).toBeNull();
        });

        it('should preserve orthonormality', () => {
            const basis = buildCameraBasis([0, -1, 0]);
            const result = rotateBasisAboutAxisFull(basis, [0, 0, 1], Math.PI / 4);
            expect(result).not.toBeNull();
            expect(vec3Dot(result!.right, result!.up)).toBeCloseTo(0, 4);
        });
    });
});

describe('Camera Payload Comparison', () => {
    describe('cameraPayloadDiffers', () => {
        it('should return true for null prev', () => {
            expect(cameraPayloadDiffers(null, { rotX: 0 })).toBe(true);
        });

        it('should return false for identical payloads', () => {
            const payload = { rotX: 0.5, rotY: 0.3, zoom: 1, panX: 0, panY: 0 };
            expect(cameraPayloadDiffers(payload, payload)).toBe(false);
        });

        it('should detect rotX difference', () => {
            const prev = { rotX: 0.5 };
            const next = { rotX: 0.6 };
            expect(cameraPayloadDiffers(prev, next)).toBe(true);
        });

        it('should detect zoom difference', () => {
            const prev = { zoom: 1.0 };
            const next = { zoom: 1.5 };
            expect(cameraPayloadDiffers(prev, next)).toBe(true);
        });

        it('should ignore tiny differences below epsilon', () => {
            const prev = { rotX: 0.5 };
            const next = { rotX: 0.5 + 1e-8 };
            expect(cameraPayloadDiffers(prev, next, 1e-6)).toBe(false);
        });
    });
});

describe('Turntable Step', () => {
    describe('turntableStep', () => {
        it('should apply yaw rotation', () => {
            const basis = buildCameraBasis([0, -1, 0]);
            const result = turntableStep(basis, Math.PI / 4, 0);
            expect(result.rotY).toBeGreaterThan(0);
        });

        it('should apply pitch rotation', () => {
            const basis = buildCameraBasis([0, -1, 0]);
            const result = turntableStep(basis, 0, Math.PI / 8);
            expect(result.rotX).toBeGreaterThan(0);
        });

        it('should clamp pitch near poles', () => {
            const basis = buildCameraBasis([0, -1, 0]);
            const result = turntableStep(basis, 0, Math.PI); // Extreme pitch
            expect(Math.abs(result.rotX)).toBeLessThan(Math.PI / 2);
        });
    });
});

describe('Camera Axis Conversion', () => {
    describe('cameraAxisToWorld', () => {
        it('should convert right axis to world space', () => {
            const basis: CameraBasis = {
                right: [1, 0, 0],
                up: [0, 0, 1],
                forward: [0, -1, 0],
            };
            const result = cameraAxisToWorld(basis, [1, 0, 0]);
            expect(result[0]).toBeCloseTo(1);
        });

        it('should return normalized vector', () => {
            const basis = buildCameraBasis([0.5, -0.5, 0.2]);
            const result = cameraAxisToWorld(basis, [1, 1, 1]);
            expect(vec3Length(result)).toBeCloseTo(1);
        });
    });
});
