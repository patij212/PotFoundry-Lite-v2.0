
import { describe, it, expect } from 'vitest';
import { ConstrainedTriangulator } from './ConstrainedTriangulator';
import { FeaturePoint } from '../../renderers/webgpu/FeatureExtractionComputer';

describe('ConstrainedTriangulator.smooth', () => {

    it('should densify a simple 3-point chain', () => {
        // Defined a sharp V shape + extra points to bypass "points.length < 4" check
        const features: FeaturePoint[] = [
            { theta: 0.0, t: 0.0, type: 1, strength: 1.0 },
            { theta: 0.05, t: 0.05, type: 1, strength: 1.0 }, // Peak
            { theta: 0.1, t: 0.0, type: 1, strength: 1.0 },
            { theta: 0.15, t: 0.0, type: 1, strength: 1.0 }  // 4th point
        ];

        // This will internally call extractChains then densifyChain
        // We assume aspect ratio 1.0
        const refined = ConstrainedTriangulator.getRefinedChains(features, 1.0);

        // We expect one chain
        expect(refined.length).toBe(1);
        const chain = refined[0];

        // Input has 3 points.
        // Distance 0->0.05 is sqrt(0.05^2 + 0.05^2) = 0.0707
        // MAX_SEGMENT_LENGTH is 0.0005
        // Expected segments ~ 0.0707 / 0.0005 = 141 per leg.
        // Total points should be approx 280+.

        // Check if it significantly densified
        expect(chain.length).toBeGreaterThan(100);
        console.log(`Refined chain length: ${chain.length}`);

        // Check continuity (no gaps)
        for (let i = 0; i < chain.length - 1; i++) {
            const p1 = chain[i];
            const p2 = chain[i + 1];
            const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            expect(dist).toBeLessThan(0.001); // Within reasonable tolerance of MAX_SEGMENT_LENGTH
        }
    });

    it('should smooth a sharp corner', () => {
        // Points must be >= 4
        const features: FeaturePoint[] = [
            { theta: 0.0, t: 0.0, type: 1, strength: 1.0 },
            { theta: 0.04, t: 0.04, type: 1, strength: 1.0 }, // Peak
            { theta: 0.08, t: 0.0, type: 1, strength: 1.0 },
            { theta: 0.12, t: 0.0, type: 1, strength: 1.0 }
        ];

        const refined = ConstrainedTriangulator.getRefinedChains(features, 1.0);
        const chain = refined[0];

        // Find the "peak" point (max y)
        // With Catmull-Rom, the curve should pass THROUGH control points.
        // So we SHOULD find a point very close to (0.05, 0.05)
        let foundPeak = false;
        let maxY = -Infinity;

        for (const p of chain) {
            if (p.y > maxY) maxY = p.y;
            if (Math.abs(p.x - 0.05) < 0.00001 && Math.abs(p.y - 0.05) < 0.00001) {
                foundPeak = true;
            }
        }

        expect(foundPeak).toBe(true);
        expect(maxY).toBeCloseTo(0.05, 4);

        // Check surrounding points to ensure curvature
        // (Not just linear interpolation)
        // At x=0.05, linear y would be 0.05.
        // Catmull-rom might be slightly different depending on tangents.
        // This is harder to test without exact implementation details,
        // but densification is the primary check.
    });

    it('should respect reduced simplify tolerance', () => {
        // Create points that form a subtle curve that RD-Peucker might flatten.
        // Tolerance is 1e-5.
        // Create points with > 4 count

        const features: FeaturePoint[] = [
            { theta: 0.0, t: 0.0, type: 1, strength: 1.0 },
            { theta: 0.04, t: 0.00002, type: 1, strength: 1.0 }, // Deviation 2e-5, x=0.04
            { theta: 0.08, t: 0.0, type: 1, strength: 1.0 },
            { theta: 0.12, t: 0.0, type: 1, strength: 1.0 }
        ];

        // Before (tol=1e-4), this would simplify to 2 points: (0,0) -> (1,0).
        // Now (tol=1e-5), this should keep the middle point (3 points total before densification).

        // However, getRefinedChains densifies it.
        // The densified chain should "bulge" to 0.00002.

        const refined = ConstrainedTriangulator.getRefinedChains(features, 1.0);
        const chain = refined[0];

        let maxY = 0;
        chain.forEach(p => maxY = Math.max(maxY, p.y));

        // If simplified away, maxY would be effectively 0 (or linear interpolation if x matched).
        expect(maxY).toBeGreaterThan(0.000015);
    });
});
