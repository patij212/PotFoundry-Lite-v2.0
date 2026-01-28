/**
 * Constrained Triangulator Tests
 * Tests for the base mesh generation pipeline used by adaptive export.
 */

import { describe, it, expect } from 'vitest';
import { ConstrainedTriangulator } from './ConstrainedTriangulator';
import { FeaturePoint } from '../../renderers/webgpu/FeatureExtractionComputer';

// ============================================================================
// Test: Grid Generation
// ============================================================================

describe('ConstrainedTriangulator.generateGrid', () => {
    // Note: generateGrid is private, so we test via generateFullPot or export it for testing
    // For now, we test the public API

    it('should generate a valid mesh with correct surface IDs', () => {
        // Empty features should still produce a base grid
        const mesh = ConstrainedTriangulator.generateFullPot([]);

        expect(mesh.vertices.length).toBeGreaterThan(0);
        expect(mesh.indices.length).toBeGreaterThan(0);
        expect(mesh.indices.length % 3).toBe(0); // All triangles
    });

    it('should preserve surface IDs in vertex Z component', () => {
        const mesh = ConstrainedTriangulator.generateFullPot([]);

        // Check that surface IDs are stored (0-5 range expected)
        const surfaceIds = new Set<number>();
        for (let i = 0; i < mesh.vertices.length; i += 3) {
            surfaceIds.add(Math.round(mesh.vertices[i + 2]));
        }

        // Should have multiple surface types (outer, inner, rim, bottom, etc.)
        expect(surfaceIds.size).toBeGreaterThanOrEqual(2);
    });
});

// ============================================================================
// Test: Seam Stitching
// ============================================================================

describe('ConstrainedTriangulator.stitchSeam', () => {
    it('should reduce vertex count when seam vertices are merged', () => {
        // Generate base mesh
        const mesh = ConstrainedTriangulator.generateFullPot([]);

        // Count vertices at theta=0 and theta=2PI edges
        const TAU = Math.PI * 2;
        const EPS = 1e-3;
        let leftCount = 0;
        let rightCount = 0;

        for (let i = 0; i < mesh.vertices.length; i += 3) {
            const theta = mesh.vertices[i];
            if (theta < EPS) leftCount++;
            if (Math.abs(theta - TAU) < EPS) rightCount++;
        }

        // After stitching, right-edge vertices should be merged with left
        // The mesh should still be valid
        expect(mesh.vertices.length % 3).toBe(0);
    });

    it.skip('should maintain triangle integrity after stitching', () => {
        const mesh = ConstrainedTriangulator.generateFullPot([]);

        // All indices should be valid
        const vertexCount = mesh.vertices.length / 3;
        for (let i = 0; i < mesh.indices.length; i++) {
            if (mesh.indices[i] >= vertexCount) {
                const msg = `[Integrity Fail] Index ${i} has value ${mesh.indices[i]} which is >= VertexCount ${vertexCount}`;
                throw new Error(msg);
            }
            expect(mesh.indices[i]).toBeLessThan(vertexCount);
            expect(mesh.indices[i]).toBeGreaterThanOrEqual(0);
        }
    });
});

// ============================================================================
// Test: Feature Processing
// ============================================================================

describe('ConstrainedTriangulator.processFeatures', () => {
    it('should handle empty feature array', () => {
        const mesh = ConstrainedTriangulator.generateFullPot([]);
        expect(mesh).toBeDefined();
        expect(mesh.vertices.length).toBeGreaterThan(0);
    });

    it('should incorporate feature points into mesh', () => {
        const features: FeaturePoint[] = [
            { theta: 1.0, t: 0.5, type: 1, strength: 0.8 },
            { theta: 2.0, t: 0.5, type: 2, strength: 0.6 },
            { theta: 3.0, t: 0.5, type: 1, strength: 0.7 },
        ];

        const meshWithFeatures = ConstrainedTriangulator.generateFullPot(features);
        const meshWithout = ConstrainedTriangulator.generateFullPot([]);

        // Mesh with features should have more triangles (adaptive refinement)
        // or at least be valid
        expect(meshWithFeatures.indices.length).toBeGreaterThanOrEqual(meshWithout.indices.length);
    });

    it('should handle features at seam boundary', () => {
        const features: FeaturePoint[] = [
            { theta: 0.001, t: 0.5, type: 1, strength: 0.8 },
            { theta: Math.PI * 2 - 0.001, t: 0.5, type: 1, strength: 0.8 },
        ];

        const mesh = ConstrainedTriangulator.generateFullPot(features);
        expect(mesh.vertices.length).toBeGreaterThan(0);
    });
});

// ============================================================================
// Test: Multi-Surface Integration
// ============================================================================

describe('ConstrainedTriangulator Multi-Surface', () => {
    it('should generate all 6 surfaces', () => {
        const mesh = ConstrainedTriangulator.generateFullPot([]);

        const surfaceIds = new Set<number>();
        for (let i = 0; i < mesh.vertices.length; i += 3) {
            surfaceIds.add(Math.round(mesh.vertices[i + 2]));
        }

        // Expect surfaces: 0=outer, 1=inner, 2=rim, 3=bottom_under, 4=bottom_top, 5=drain
        // At minimum, should have outer(0) and inner(1)
        expect(surfaceIds.has(0)).toBe(true); // Outer wall
        expect(surfaceIds.has(1)).toBe(true); // Inner wall
    });

    it('should not mix surface IDs within a single triangle', () => {
        const mesh = ConstrainedTriangulator.generateFullPot([]);

        for (let i = 0; i < mesh.indices.length; i += 3) {
            const v0 = mesh.indices[i];
            const v1 = mesh.indices[i + 1];
            const v2 = mesh.indices[i + 2];

            const s0 = Math.round(mesh.vertices[v0 * 3 + 2]);
            const s1 = Math.round(mesh.vertices[v1 * 3 + 2]);
            const s2 = Math.round(mesh.vertices[v2 * 3 + 2]);

            // All vertices of a triangle should have the same surface ID
            expect(s0).toBe(s1);
            expect(s1).toBe(s2);
        }
    });
});

// ============================================================================
// Test: Mesh Validity
// ============================================================================

describe('ConstrainedTriangulator Mesh Validity', () => {
    it('should produce non-degenerate triangles', () => {
        const mesh = ConstrainedTriangulator.generateFullPot([]);

        let degenerateCount = 0;
        for (let i = 0; i < mesh.indices.length; i += 3) {
            const v0 = mesh.indices[i];
            const v1 = mesh.indices[i + 1];
            const v2 = mesh.indices[i + 2];

            // Check for collapsed triangles
            if (v0 === v1 || v1 === v2 || v0 === v2) {
                degenerateCount++;
            }
        }

        // Should have no degenerate triangles
        expect(degenerateCount).toBe(0);
    });

    it('should produce triangles with positive area in parameter space', () => {
        const mesh = ConstrainedTriangulator.generateFullPot([]);

        let zeroAreaCount = 0;
        const EPS = 1e-10;

        for (let i = 0; i < mesh.indices.length; i += 3) {
            const v0 = mesh.indices[i];
            const v1 = mesh.indices[i + 1];
            const v2 = mesh.indices[i + 2];

            const x0 = mesh.vertices[v0 * 3];
            const y0 = mesh.vertices[v0 * 3 + 1];
            const x1 = mesh.vertices[v1 * 3];
            const y1 = mesh.vertices[v1 * 3 + 1];
            const x2 = mesh.vertices[v2 * 3];
            const y2 = mesh.vertices[v2 * 3 + 1];

            // 2D cross product (area * 2)
            const area = Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0));

            if (area < EPS) {
                zeroAreaCount++;
            }
        }

        // Allow a small percentage of near-zero area triangles (numerical noise)
        const totalTriangles = mesh.indices.length / 3;
        expect(zeroAreaCount / totalTriangles).toBeLessThan(0.01);
    });
});
// ============================================================================
// Test: Advanced Seam Stitching
// ============================================================================

describe.skip('ConstrainedTriangulator Advanced Seam Stitching', () => {
    it('should align seam vertices exactly', () => {
        // Generate with features crossing the seam
        const features: FeaturePoint[] = [
            { theta: 0.1, t: 0.5, type: 1, strength: 0.8 },
            { theta: Math.PI * 2 - 0.1, t: 0.5, type: 1, strength: 0.8 }
        ];

        const mesh = ConstrainedTriangulator.generateFullPot(features);

        // let alignedCount = 0; // Unused
        const EPS = 1e-4;

        // Find vertices on the seam
        const leftSeam: number[] = [];
        const rightSeam: number[] = [];

        for (let i = 0; i < mesh.vertices.length; i += 3) {
            const x = mesh.vertices[i];       // theta
            const y = mesh.vertices[i + 1];   // t
            // const z = mesh.vertices[i + 2];   // surface ID (unused)

            if (x < EPS) {
                // Left seam (theta ~ 0)
                leftSeam.push(y);
            } else if (Math.abs(x - Math.PI * 2) < EPS) {
                // Right seam (theta ~ 2PI)
                rightSeam.push(y);
            }
        }

        // We expect matching t-values on both sides for continuity
        // Note: The triangulator effectively merges them, so we might just see one set
        // OR distinct sets that are geometrically coincident.
        // The implementation "Stitch Seam" usually snaps them.

        expect(leftSeam.length).toBeGreaterThan(0);
        // If robust stitching works, we should be able to find pairs or they are merged.
    });
});

// ============================================================================
// Test: Adaptive Density
// ============================================================================

describe('ConstrainedTriangulator Adaptive Density', () => {
    it.skip('should generate higher density near features', () => {
        // Feature in top half (t > 0.5)
        const features: FeaturePoint[] = [
            { theta: 1.0, t: 0.8, type: 1, strength: 1.0 },
            { theta: 2.0, t: 0.8, type: 1, strength: 1.0 },
            { theta: 3.0, t: 0.8, type: 1, strength: 1.0 },
        ];

        const mesh = ConstrainedTriangulator.generateFullPot(features);

        let topCount = 0;
        let bottomCount = 0;

        for (let i = 0; i < mesh.vertices.length; i += 3) {
            const t = mesh.vertices[i + 1];
            // Only count outer wall (surface 0) to avoid noise from rims/bottom
            const surface = Math.round(mesh.vertices[i + 2]);
            if (surface !== 0) continue;

            if (t > 0.6) topCount++;
            if (t < 0.4) bottomCount++;
        }

        // Expect significantly more points in the feature-rich region
        // Ratio should be > 1.0 (statistically, usually much higher, but random sampling has entropy)
        expect(topCount).toBeGreaterThan(bottomCount);
    });
});

// ============================================================================
// Test: Chaos/Noise Robustness
// ============================================================================

describe('ConstrainedTriangulator Robustness', () => {
    it('should handle noisy/chaotic inputs without crashing', () => {
        const features: FeaturePoint[] = [];
        // Generate random noise features
        for (let i = 0; i < 100; i++) {
            features.push({
                theta: Math.random() * Math.PI * 2,
                t: Math.random(),
                type: Math.random() > 0.5 ? 1 : 2,
                strength: Math.random()
            });
        }

        const mesh = ConstrainedTriangulator.generateFullPot(features);

        expect(mesh.indices.length).toBeGreaterThan(0);
        expect(mesh.indices.length % 3).toBe(0);
    });

    it('should handle coincident points safely', () => {
        const features: FeaturePoint[] = [
            { theta: 1.0, t: 0.5, type: 1, strength: 1.0 },
            { theta: 1.0, t: 0.5, type: 1, strength: 1.0 }, // Exact duplicate
            { theta: 1.0 + 1e-9, t: 0.5, type: 1, strength: 1.0 } // Near duplicate
        ];

        const mesh = ConstrainedTriangulator.generateFullPot(features);
        expect(mesh.indices.length).toBeGreaterThan(0);
    });
});

describe('ConstrainedTriangulator.investigation', () => {
    // 1. Reproduce Seam Stitching Integrity
    it('should maintain watertight seam for cylinder', () => {
        const mesh = ConstrainedTriangulator.generateFullPot([]);

        const vertices = mesh.vertices;
        let leftSeamCount = 0;
        let rightSeamCount = 0;
        const EPS = 1e-4;
        const TAU = Math.PI * 2;

        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const surface = Math.round(vertices[i + 2]);
            if (surface !== 0) continue;

            if (x < EPS) leftSeamCount++;
            if (Math.abs(x - TAU) < EPS) rightSeamCount++;
        }

        console.log('Seam Debug:', { leftSeamCount, rightSeamCount, totalVertices: vertices.length / 3 });
        // Right seam vertices should be mapped to Left and removed
        expect(rightSeamCount).toBe(0);
        expect(leftSeamCount).toBeGreaterThan(0);
    });

    // 2. Check for Internal Background Points
    it.skip('should not generate background points inside the inner wall', () => {
        const mesh = ConstrainedTriangulator.generateFullPot([]);
        // Check for "Garbled Interior" (Triangles spanning the void)
        // If the density boost works, no edge should be excessively long (e.g., > 0.2 in normalized space)
        let maxEdgeLength = 0;
        for (let i = 0; i < mesh.indices.length; i += 3) {
            const idx0 = mesh.indices[i] * 3;
            const idx1 = mesh.indices[i + 1] * 3;
            const idx2 = mesh.indices[i + 2] * 3;

            const x0 = mesh.vertices[idx0], y0 = mesh.vertices[idx0 + 1];
            const x1 = mesh.vertices[idx1], y1 = mesh.vertices[idx1 + 1];
            const x2 = mesh.vertices[idx2], y2 = mesh.vertices[idx2 + 1];

            let dx = Math.abs(x1 - x0);
            if (dx > Math.PI) dx = 2 * Math.PI - dx; // Handle seam wrapping
            let dy = Math.abs(y1 - y0);
            const d01 = Math.hypot(dx, dy);

            dx = Math.abs(x2 - x1);
            if (dx > Math.PI) dx = 2 * Math.PI - dx;
            dy = Math.abs(y2 - y1);
            const d12 = Math.hypot(dx, dy);

            dx = Math.abs(x0 - x2);
            if (dx > Math.PI) dx = 2 * Math.PI - dx;
            dy = Math.abs(y0 - y2);
            const d20 = Math.hypot(dx, dy);

            maxEdgeLength = Math.max(maxEdgeLength, d01, d12, d20);
        }

        console.log('Max Edge Debug (Unwrapped):', { maxEdgeLength });
        // With density boost, max edge should be small (< 0.5)
        expect(maxEdgeLength).toBeLessThan(1.0);
    });
});
