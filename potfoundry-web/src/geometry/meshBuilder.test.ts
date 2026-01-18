/**
 * Mesh Builder Tests
 * Tests for the pot mesh generation utilities.
 */
import { describe, it, expect } from 'vitest';
import {
    buildPotMesh,
    calculateMeshVolume,
    calculateMeshSurfaceArea,
    getMeshBounds,
} from './meshBuilder';

describe('buildPotMesh', () => {
    it('should generate mesh with default parameters', () => {
        const result = buildPotMesh();
        expect(result.mesh).toBeDefined();
        expect(result.mesh.vertices).toBeInstanceOf(Float32Array);
        expect(result.mesh.indices).toBeInstanceOf(Uint32Array);
    });

    it('should generate mesh with vertices', () => {
        const result = buildPotMesh();
        expect(result.mesh.vertexCount).toBeGreaterThan(0);
    });

    it('should generate mesh with triangles', () => {
        const result = buildPotMesh();
        expect(result.mesh.triangleCount).toBeGreaterThan(0);
    });

    it('should return diagnostics', () => {
        const result = buildPotMesh();
        expect(result.diagnostics).toBeDefined();
        expect(result.diagnostics.vertexCount).toBeGreaterThan(0);
        expect(result.diagnostics.faceCount).toBeGreaterThan(0);
    });

    it('should accept custom dimensions', () => {
        const result = buildPotMesh({ H: 150, Rt: 80, Rb: 50 });
        expect(result.mesh).toBeDefined();
    });

    it('should accept custom quality', () => {
        const result = buildPotMesh({}, { nTheta: 36, nZ: 20 });
        expect(result.mesh).toBeDefined();
    });

    it('should accept different style IDs', () => {
        const styles = ['SuperformulaBlossom', 'FourierBloom', 'SpiralRidges', 'GothicArches'] as const;
        for (const style of styles) {
            const result = buildPotMesh({}, {}, style);
            expect(result.mesh).toBeDefined();
        }
    });

    it('should accept style options', () => {
        const result = buildPotMesh({}, {}, 'SuperformulaBlossom', { sfMBase: 8 });
        expect(result.mesh).toBeDefined();
    });

    it('should have more than zero estimated top OD', () => {
        const result = buildPotMesh();
        expect(result.diagnostics.estimatedTopOdMm).toBeGreaterThan(0);
    });
});

describe('calculateMeshVolume', () => {
    it('should calculate positive volume', () => {
        const { mesh } = buildPotMesh();
        const volume = calculateMeshVolume(mesh);
        expect(volume).toBeGreaterThan(0);
    });

    it('should return different volumes for different sizes', () => {
        const small = buildPotMesh({ H: 60, Rt: 35, Rb: 25 });
        const large = buildPotMesh({ H: 120, Rt: 70, Rb: 50 });

        const smallVolume = calculateMeshVolume(small.mesh);
        const largeVolume = calculateMeshVolume(large.mesh);

        expect(largeVolume).toBeGreaterThan(smallVolume);
    });
});

describe('calculateMeshSurfaceArea', () => {
    it('should calculate positive surface area', () => {
        const { mesh } = buildPotMesh();
        const area = calculateMeshSurfaceArea(mesh);
        expect(area).toBeGreaterThan(0);
    });

    it('should return different areas for different sizes', () => {
        const small = buildPotMesh({ H: 60, Rt: 35, Rb: 25 });
        const large = buildPotMesh({ H: 120, Rt: 70, Rb: 50 });

        const smallArea = calculateMeshSurfaceArea(small.mesh);
        const largeArea = calculateMeshSurfaceArea(large.mesh);

        expect(largeArea).toBeGreaterThan(smallArea);
    });
});

describe('getMeshBounds', () => {
    it('should return bounding box', () => {
        const { mesh } = buildPotMesh();
        const bounds = getMeshBounds(mesh);

        expect(bounds.min).toBeDefined();
        expect(bounds.max).toBeDefined();
        expect(bounds.center).toBeDefined();
        expect(bounds.size).toBeDefined();
    });

    it('should have valid min/max', () => {
        const { mesh } = buildPotMesh();
        const bounds = getMeshBounds(mesh);

        expect(bounds.max[0]).toBeGreaterThan(bounds.min[0]);
        expect(bounds.max[1]).toBeGreaterThan(bounds.min[1]);
        expect(bounds.max[2]).toBeGreaterThan(bounds.min[2]);
    });

    it('should have positive size', () => {
        const { mesh } = buildPotMesh();
        const bounds = getMeshBounds(mesh);

        expect(bounds.size[0]).toBeGreaterThan(0);
        expect(bounds.size[1]).toBeGreaterThan(0);
        expect(bounds.size[2]).toBeGreaterThan(0);
    });

    it('should center be between min and max', () => {
        const { mesh } = buildPotMesh();
        const bounds = getMeshBounds(mesh);

        for (let i = 0; i < 3; i++) {
            expect(bounds.center[i]).toBeGreaterThanOrEqual(bounds.min[i]);
            expect(bounds.center[i]).toBeLessThanOrEqual(bounds.max[i]);
        }
    });
});
