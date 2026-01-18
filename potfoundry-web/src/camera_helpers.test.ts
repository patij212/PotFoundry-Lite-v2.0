/**
 * Camera Helpers Tests
 * Tests for ray casting and intersection utilities.
 */
import { describe, it, expect } from 'vitest';
import {
    invertMat4,
    intersectRayZPlane,
    intersectRayCylinder,
    Ray,
} from './camera_helpers';

describe('invertMat4', () => {
    it('should invert identity matrix', () => {
        const identity = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
        ]);
        const result = invertMat4(identity);
        expect(result).not.toBeNull();
        expect(result![0]).toBeCloseTo(1);
        expect(result![5]).toBeCloseTo(1);
        expect(result![10]).toBeCloseTo(1);
        expect(result![15]).toBeCloseTo(1);
    });

    it('should return null for singular matrix', () => {
        const singular = new Float32Array([
            0, 0, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 0,
        ]);
        const result = invertMat4(singular);
        expect(result).toBeNull();
    });

    it('should invert translation matrix', () => {
        const translation = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            5, 10, 15, 1,
        ]);
        const result = invertMat4(translation);
        expect(result).not.toBeNull();
        // Inverse translation should negate the translation components
        expect(result![12]).toBeCloseTo(-5);
        expect(result![13]).toBeCloseTo(-10);
        expect(result![14]).toBeCloseTo(-15);
    });
});

describe('intersectRayZPlane', () => {
    it('should find intersection with XY plane', () => {
        const ray: Ray = {
            origin: [0, 0, 10],
            dir: [0, 0, -1],
        };
        const result = intersectRayZPlane(ray, 0);
        expect(result).not.toBeNull();
        expect(result![2]).toBeCloseTo(0);
    });

    it('should return null for parallel ray', () => {
        const ray: Ray = {
            origin: [0, 0, 10],
            dir: [1, 0, 0], // Parallel to Z plane
        };
        const result = intersectRayZPlane(ray, 0);
        expect(result).toBeNull();
    });

    it('should return null for ray going away from plane', () => {
        const ray: Ray = {
            origin: [0, 0, 10],
            dir: [0, 0, 1], // Going away from z=0
        };
        const result = intersectRayZPlane(ray, 0);
        expect(result).toBeNull();
    });

    it('should find intersection at specific Z', () => {
        const ray: Ray = {
            origin: [0, 0, 20],
            dir: [0, 0, -1],
        };
        const result = intersectRayZPlane(ray, 5);
        expect(result).not.toBeNull();
        expect(result![2]).toBeCloseTo(5);
    });

    it('should preserve X and Y at intersection', () => {
        const ray: Ray = {
            origin: [5, 10, 20],
            dir: [0, 0, -1],
        };
        const result = intersectRayZPlane(ray, 0);
        expect(result).not.toBeNull();
        expect(result![0]).toBeCloseTo(5);
        expect(result![1]).toBeCloseTo(10);
    });
});

describe('intersectRayCylinder', () => {
    it('should find intersection with cylinder', () => {
        const ray: Ray = {
            origin: [10, 0, 50],
            dir: [-1, 0, 0],
        };
        const result = intersectRayCylinder(ray, 5, 0, 100);
        expect(result).not.toBeNull();
    });

    it('should return null for ray missing cylinder', () => {
        const ray: Ray = {
            origin: [10, 0, 50],
            dir: [0, 1, 0], // Parallel, outside
        };
        const result = intersectRayCylinder(ray, 5, 0, 100);
        expect(result).toBeNull();
    });

    it('should return null for zero radius', () => {
        const ray: Ray = {
            origin: [10, 0, 50],
            dir: [-1, 0, 0],
        };
        const result = intersectRayCylinder(ray, 0, 0, 100);
        expect(result).toBeNull();
    });

    it('should respect Z bounds', () => {
        const ray: Ray = {
            origin: [10, 0, 150], // Above cylinder
            dir: [-1, 0, 0],
        };
        const result = intersectRayCylinder(ray, 5, 0, 100);
        expect(result).toBeNull();
    });

    it('should return intersection within Z bounds', () => {
        const ray: Ray = {
            origin: [10, 0, 50],
            dir: [-1, 0, 0],
        };
        const result = intersectRayCylinder(ray, 5, 0, 100);
        if (result) {
            expect(result[2]).toBeGreaterThanOrEqual(0);
            expect(result[2]).toBeLessThanOrEqual(100);
        }
    });
});
