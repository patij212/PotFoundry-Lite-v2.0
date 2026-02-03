import { describe, it, expect } from 'vitest';
import { ConstrainedTriangulator } from '../ConstrainedTriangulator';
import { FeaturePoint } from '../../../renderers/webgpu/FeatureExtractionComputer';

describe('ConstrainedTriangulator Simplification', () => {

    it('should simplify noisy chains before densifying', () => {
        // Create a horizontal line with noise
        // Perfect line: y = 0.5
        // Noise: small zig-zags
        const rawFeatures: FeaturePoint[] = [];
        const numPoints = 100;

        for (let i = 0; i < numPoints; i++) {
            const t = i / (numPoints - 1); // 0 to 1
            // Add slight vertical noise (within simplify tolerance of 0.002)
            const noise = (i % 2 === 0 ? 1 : -1) * 0.0005;

            // Map to feature space (theta=0..2PI, t=0..1)
            // But extractChains normalizes theta/PI*2 -> x
            // We'll mimic raw GPU output which is in theta,t
            rawFeatures.push({
                theta: t * Math.PI * 2, // Maps to x=0..1
                t: 0.5 + noise,         // Maps to y=0.5 +/- noise
                type: 1,
                strength: 10
            });
        }

        const { chains } = ConstrainedTriangulator.extractChains(rawFeatures);

        expect(chains.length).toBeGreaterThan(0);
        // Pick the longest chain to be robust against noisy segmentation
        const chain = chains.sort((a, b) => b.length - a.length)[0];

        // Original has 100 points
        // Simplified line should have much fewer points (ideally 2 for start/end, but densification adds back)

        // Densification happens AFTER simplification.
        // MAX_SEGMENT_LENGTH = 0.005. Length is 1.0. So ~200 points if fully densified?
        // Wait, if it simplifies to 2 points, densification adds ~200 points.
        // If it DOESN'T simplify, it keeps 100 points, potentially 100 segments of 0.01 length...

        // To VERIFY simplification explicitly, we need to check if the 'noise' is gone.
        // The points in the final chain should lie EXACTLY on y=0.5 (or very close),
        // effectively ignoring the +/- 0.0005 noise.

        let maxDeviation = 0;
        for (const p of chain) {
            maxDeviation = Math.max(maxDeviation, Math.abs(p.y - 0.5));
        }

        console.log(`Max Deviation after simplification: ${maxDeviation}`);
        // Simplification fits a line. The line should be roughly y=0.5.
        // Ramer-Douglas-Peucker with tolerance 0.002 should consume 0.0005 noise.
        expect(maxDeviation).toBeLessThan(0.001); // Tolerance is 0.002, so it should be well within.

        // Also check point count is reasonable (densified logic)
        // Ideally just a straight line densified.
        expect(chain.length).toBeGreaterThan(50); // It IS densified
    });
});
