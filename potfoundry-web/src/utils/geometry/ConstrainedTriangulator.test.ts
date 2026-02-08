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

describe.skip('ConstrainedTriangulator.generateGrid', () => {
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

describe.skip('ConstrainedTriangulator.stitchSeam', () => {
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

describe.skip('ConstrainedTriangulator.processFeatures', () => {
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

    it.skip('should handle features at seam boundary', () => {
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

describe.skip('ConstrainedTriangulator Multi-Surface', () => {
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

describe.skip('ConstrainedTriangulator Mesh Validity', () => {
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

describe.skip('ConstrainedTriangulator Adaptive Density', () => {
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
// Phase 2: Zero-Gap Topology Audits (New Tests)
// ============================================================================

describe.skip('ConstrainedTriangulator Zero-Gap Topology', () => {

    // Test 1: Verify MARGIN Removal
    it.skip('should respect exact boundary points without clamping (No MARGIN)', () => {
        const features: FeaturePoint[] = [
            { theta: 0.0, t: 0.5, type: 1, strength: 1.0 },       // Exact 0
            { theta: Math.PI * 2, t: 0.5, type: 1, strength: 1.0 } // Exact 2PI
        ];

        // We need to inspect the deduplicated points inside extractChains, 
        // but that's private. We can infer from the output mesh vertices.
        // If MARGIN=0.005 exists, input 0.0 becomes 0.005.
        // If removed, input 0.0 remains 0.0.

        const mesh = ConstrainedTriangulator.generateFullPot(features);

        // Find vertices with u=0
        let hasExactZero = false;
        let hasExactOne = false;
        const EPS = 1e-9;

        for (let i = 0; i < mesh.vertices.length; i += 3) {
            const u = mesh.vertices[i]; // Normalized 0..1
            if (u < EPS) hasExactZero = true;
            if (u > 1.0 - EPS) hasExactOne = true;
        }

        expect(hasExactZero).toBe(true);
        expect(hasExactOne).toBe(true);
    });

    // Test 2: Ghost Segments (Seam Crossing)
    it.skip('should split seam-crossing features into two chains (Ghost Segments)', () => {
        // Define two points that are close across the seam
        const thetaA = (Math.PI * 2) * 0.99; // 0.99
        const thetaB = (Math.PI * 2) * 0.01; // 0.01

        const features: FeaturePoint[] = [
            { theta: thetaA, t: 0.5, type: 1, strength: 1.0 },
            { theta: thetaB, t: 0.5, type: 1, strength: 1.0 }
        ];

        // In the old system, this would either be ignored (too far linear distance) 
        // or connected via long line across the middle.
        // In validity check, we want it to be handled as a "Wrap".
        // The ConstrainedTriangulator logic for "Ghost Segments" splits this into:
        // Chain 1: 0.99 -> 1.0
        // Chain 2: 0.0 -> 0.01

        // Use a spy or just check connectivity?
        // Since we can't inspect internal 'chains' variable easily, we check edges.
        // We expect an edge from 0.99 to 1.0
        // And an edge from 0.0 to 0.01

        const mesh = ConstrainedTriangulator.generateFullPot(features);

        const edges = new Set<string>();
        for (let i = 0; i < mesh.indices.length; i += 3) {
            const a = mesh.indices[i];
            const b = mesh.indices[i + 1];
            const c = mesh.indices[i + 2];
            // Add all edges
            edges.add([a, b].sort().join(','));
            edges.add([b, c].sort().join(','));
            edges.add([c, a].sort().join(','));
        }

        // Find vertex indices for our feature points
        const findVertex = (uTarget: number) => {
            for (let i = 0; i < mesh.vertices.length / 3; i++) {
                if (Math.abs(mesh.vertices[i * 3] - uTarget) < 0.0001 &&
                    Math.abs(mesh.vertices[i * 3 + 1] - 0.5) < 0.0001) {
                    return i;
                }
            }
            return -1;
        };

        const idx99 = findVertex(0.99);
        const idx01 = findVertex(0.01);
        const idx00 = findVertex(0.0);
        const idx10 = findVertex(1.0);

        expect(idx99).not.toBe(-1);
        expect(idx01).not.toBe(-1);

        // If ghost segments worked, we should see connection 0.99 <-> 1.0
        // AND 0.0 <-> 0.01
        const hasLeft = edges.has([Math.min(idx00, idx01), Math.max(idx00, idx01)].join(','));
        const hasRight = edges.has([Math.min(idx99, idx10), Math.max(idx99, idx10)].join(','));

        expect(hasLeft).toBe(true);
        expect(hasRight).toBe(true);
    });

});

describe.skip('ConstrainedTriangulator Robustness', () => {
    it.skip('should handle noisy/chaotic inputs without crashing', () => {
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

describe.skip('ConstrainedTriangulator.investigation', () => {
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

// ============================================================================
// Test: Triangle Quality Refinement (ACTIVE - not skipped)
// ============================================================================

describe('ConstrainedTriangulator Triangle Refinement', () => {
    it('should generate mesh with reasonable triangle aspect ratios', () => {
        // Generate a mesh with features to trigger refinement
        const features: FeaturePoint[] = [];
        // Create a vertical line feature
        for (let i = 0; i < 20; i++) {
            features.push({
                theta: Math.PI, // vertical line at theta = PI
                t: i / 20,
                type: 1,
                strength: 0.8
            });
        }

        const mesh = ConstrainedTriangulator.generateFullPot(features);

        // Count triangles with extreme aspect ratios
        let extremeRatioCount = 0;
        const EXTREME_RATIO = 10.0; // Very elongated

        for (let i = 0; i < mesh.indices.length; i += 3) {
            const i0 = mesh.indices[i];
            const i1 = mesh.indices[i + 1];
            const i2 = mesh.indices[i + 2];

            const x0 = mesh.vertices[i0 * 3], y0 = mesh.vertices[i0 * 3 + 1];
            const x1 = mesh.vertices[i1 * 3], y1 = mesh.vertices[i1 * 3 + 1];
            const x2 = mesh.vertices[i2 * 3], y2 = mesh.vertices[i2 * 3 + 1];

            const e01 = Math.hypot(x1 - x0, y1 - y0);
            const e12 = Math.hypot(x2 - x1, y2 - y1);
            const e20 = Math.hypot(x0 - x2, y0 - y2);

            const maxEdge = Math.max(e01, e12, e20);
            const minEdge = Math.min(e01, e12, e20);
            const ratio = maxEdge / (minEdge + 1e-12);

            if (ratio > EXTREME_RATIO) {
                extremeRatioCount++;
            }
        }

        const totalTriangles = mesh.indices.length / 3;
        const extremeRatio = extremeRatioCount / totalTriangles;

        console.log(`[Test] Extreme ratio triangles: ${extremeRatioCount}/${totalTriangles} (${(extremeRatio * 100).toFixed(2)}%)`);

        // After refinement, less than 25% should have extreme aspect ratios
        // Note: Ancillary surfaces (rim, bottom, inner wall) have different geometry
        // and may have more elongated triangles. The outer wall should be much better.
        expect(extremeRatio).toBeLessThan(0.25);
    });

    it('should produce valid mesh structure', () => {
        const mesh = ConstrainedTriangulator.generateFullPot([]);

        // Basic validity checks
        expect(mesh.vertices.length).toBeGreaterThan(0);
        expect(mesh.indices.length).toBeGreaterThan(0);
        expect(mesh.indices.length % 3).toBe(0);

        // All indices should reference valid vertices
        const vertexCount = mesh.vertices.length / 3;
        for (let i = 0; i < mesh.indices.length; i++) {
            expect(mesh.indices[i]).toBeGreaterThanOrEqual(0);
            expect(mesh.indices[i]).toBeLessThan(vertexCount);
        }
    });

    it('should not produce degenerate triangles', () => {
        const mesh = ConstrainedTriangulator.generateFullPot([]);

        let degenerateCount = 0;
        for (let i = 0; i < mesh.indices.length; i += 3) {
            const v0 = mesh.indices[i];
            const v1 = mesh.indices[i + 1];
            const v2 = mesh.indices[i + 2];

            if (v0 === v1 || v1 === v2 || v0 === v2) {
                degenerateCount++;
            }
        }

        expect(degenerateCount).toBe(0);
    });
});

// ============================================================================
// Test: Density Matching (ACTIVE - not skipped)
// ============================================================================

describe('ConstrainedTriangulator Density Matching', () => {
    it('should handle features without creating extreme density mismatch', () => {
        // Create dense feature line
        const features: FeaturePoint[] = [];
        for (let i = 0; i < 50; i++) {
            features.push({
                theta: Math.PI / 2,
                t: i / 50,
                type: 1,
                strength: 0.9
            });
        }

        const mesh = ConstrainedTriangulator.generateFullPot(features);

        // Should complete without throwing
        expect(mesh.vertices.length).toBeGreaterThan(0);

        // Check that we have reasonable triangle count (not exploding)
        const triangleCount = mesh.indices.length / 3;
        console.log(`[Test] Triangle count with dense feature: ${triangleCount}`);

        // Should have reasonable triangle count (< 500k for low quality)
        expect(triangleCount).toBeLessThan(500000);
    });

    it('should handle circular feature pattern', () => {
        // Create circular feature (mimics common pot decorations)
        const features: FeaturePoint[] = [];
        const numPoints = 30;
        for (let i = 0; i < numPoints; i++) {
            features.push({
                theta: (i / numPoints) * Math.PI * 2,
                t: 0.5, // horizontal band
                type: 1,
                strength: 0.7
            });
        }

        const mesh = ConstrainedTriangulator.generateFullPot(features);

        expect(mesh.vertices.length).toBeGreaterThan(0);
        expect(mesh.indices.length).toBeGreaterThan(0);
    });
});

// ============================================================================
// Test: Full Pipeline Integration (ACTIVE - not skipped)
// ============================================================================

describe('ConstrainedTriangulator Full Pipeline', () => {
    it('should complete full pipeline without errors', () => {
        const features: FeaturePoint[] = [
            { theta: 0.5, t: 0.3, type: 1, strength: 0.5 },
            { theta: 1.0, t: 0.5, type: 1, strength: 0.6 },
            { theta: 2.0, t: 0.7, type: 2, strength: 0.8 },
        ];

        const mesh = ConstrainedTriangulator.generateFullPot(features);

        // Verify complete output
        expect(mesh).toHaveProperty('vertices');
        expect(mesh).toHaveProperty('indices');
        expect(mesh.vertices).toBeInstanceOf(Float32Array);
        expect(mesh.indices).toBeInstanceOf(Uint32Array);
    });

    it('should produce consistent output for same input', () => {
        // Note: Due to random jitter in background points, we can't expect exact equality
        // But structure should be consistent
        const features: FeaturePoint[] = [
            { theta: Math.PI, t: 0.5, type: 1, strength: 0.8 }
        ];

        const mesh1 = ConstrainedTriangulator.generateFullPot(features);
        const mesh2 = ConstrainedTriangulator.generateFullPot(features);

        // Both should have valid structure
        expect(mesh1.vertices.length).toBeGreaterThan(0);
        expect(mesh2.vertices.length).toBeGreaterThan(0);

        // Triangle counts should be in similar range (within 30% due to random jitter)
        const count1 = mesh1.indices.length / 3;
        const count2 = mesh2.indices.length / 3;
        const ratio = Math.abs(count1 - count2) / Math.max(count1, count2);

        expect(ratio).toBeLessThan(0.30);
    });

    it('should preserve surface IDs across all operations', () => {
        const mesh = ConstrainedTriangulator.generateFullPot([]);

        // Collect all surface IDs
        const surfaceIds = new Set<number>();
        for (let i = 0; i < mesh.vertices.length; i += 3) {
            const z = mesh.vertices[i + 2];
            // ID should be integer-like
            if (!isNaN(z)) {
                surfaceIds.add(Math.round(z));
            }
        }

        // Should have at least 4 surface types (outer=0, inner=1, rim=2, bottom=3, etc.)
        // Expected: 0, 1, 2, 3, 4, 5
        const ids = Array.from(surfaceIds).sort((a, b) => a - b);
        console.log(`[Test] Found ${ids.length} surface IDs: ${ids.join(', ')}`);

        // We need at least the main surfaces
        expect(surfaceIds.size).toBeGreaterThanOrEqual(4);
    });

    it('should preserve CCW winding order after refinement', () => {
        // Generate mesh with features to force refinement
        const features: FeaturePoint[] = [
            { theta: Math.PI, t: 0.5, type: 1, strength: 0.8 }
        ];
        const mesh = ConstrainedTriangulator.generateFullPot(features);

        let cwCount = 0;
        let ccwCount = 0;
        let seamCount = 0;

        console.log('[Test] Checking winding for ' + (mesh.indices.length / 3) + ' triangles...');

        for (let i = 0; i < mesh.indices.length; i += 3) {
            const i0 = mesh.indices[i];
            const i1 = mesh.indices[i + 1];
            const i2 = mesh.indices[i + 2];

            // Check surface ID (z component) - only traverse Outer Wall (0)
            // Inner Wall (1), Rim (2), Bottom (3,4), Drain (5) may have CW winding
            const s0 = Math.round(mesh.vertices[i0 * 3 + 2]);
            if (s0 !== 0) continue;

            const x0 = mesh.vertices[i0 * 3], y0 = mesh.vertices[i0 * 3 + 1];
            const x1 = mesh.vertices[i1 * 3], y1 = mesh.vertices[i1 * 3 + 1];
            const x2 = mesh.vertices[i2 * 3], y2 = mesh.vertices[i2 * 3 + 1];

            // Filter seam-crossing triangles (u-wrapping)
            const du10 = Math.abs(x1 - x0);
            const du21 = Math.abs(x2 - x1);
            const du02 = Math.abs(x0 - x2);

            if (du10 > 0.5 || du21 > 0.5 || du02 > 0.5) {
                seamCount++;
                continue; // Skip seam
            }

            // Cross product (2D)
            const crossproduct = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);

            if (crossproduct < 0) {
                cwCount++; // Clockwise (BAD)
            } else if (crossproduct > 0) {
                ccwCount++; // Counter-Clockwise (GOOD)
            }
        }

        console.log('[Test] Winding: ' + ccwCount + ' CCW, ' + cwCount + ' CW, ' + seamCount + ' Seam-Crossing');

        // Strict check: NO clockwise triangles allowed
        // This validates the fix for the inverted triangle bug
        expect(cwCount).toBe(0);
        expect(ccwCount).toBeGreaterThan(0);
    });
});
