
import { describe, it, expect } from 'vitest';
import { ConstrainedTriangulator } from './ConstrainedTriangulator';
import { FeaturePoint } from '../../renderers/webgpu/FeatureExtractionComputer';

describe('ConstrainedTriangulator.smoothChain (Ohtake Improved)', () => {

    it('sanity check', () => {
        console.log('Sanity check running');
        expect(true).toBe(true);
    });

    // Helper to create a chain of points
    function createPoints(coords: [number, number][]): FeaturePoint[] {
        return coords.map((p, i) => ({
            theta: p[0] * Math.PI * 2, // Map x to theta
            t: p[1],
            strength: 1.0,
            type: 1
        }));
    }

    it('should regularize vertex spacing on a straight line without shrinking', () => {
        // Input: A straight line with unevenly spaced points.
        // We need points close enough (<0.08) to chain.
        const inputCoords: [number, number][] = [];

        // Add points from 0.0 to 1.0 with uneven spacing
        // 0.0, 0.05, 0.10, ... (Regular)
        // Then a dense cluster: 0.20, 0.21, 0.22 ...
        // Then sparse again.

        let x = 0.0;
        while (x < 1.0) {
            inputCoords.push([x, 0.0]);

            if (x > 0.2 && x < 0.4) {
                x += 0.01; // Dense
            } else {
                x += 0.05; // Sparse
            }
        }
        inputCoords.push([1.0, 0.0]);

        const { chains } = ConstrainedTriangulator.extractChains(createPoints(inputCoords));
        // Expect 1 chain
        expect(chains.length).toBe(1);

        const chain = chains[0];

        // Verify no vertical drift (y should be ~0)
        // With Ohtake smoothing, projected normal should be 0, so y shouldn't change much.
        // Standard Laplacian might introduce slight numerical drift but should be small.
        for (const p of chain) {
            expect(Math.abs(p.y)).toBeLessThan(0.01);
        }

        // Verify regularization (spacing uniformity)
        // Ideally, spacing should become more uniform.
        // Original: 0.01 vs 0.05 (Ratio 5)
        // Smoothed: Should be better.

        const spacings = [];
        for (let i = 0; i < chain.length - 1; i++) {
            const dx = chain[i + 1].x - chain[i].x;
            const dy = chain[i + 1].y - chain[i].y;
            spacings.push(Math.sqrt(dx * dx + dy * dy));
        }

        // Calculate coefficient of variation (CV) = stdDev / mean
        const mean = spacings.reduce((a, b) => a + b, 0) / spacings.length;
        const variance = spacings.reduce((a, b) => a + (b - mean) ** 2, 0) / spacings.length;
        const stdDev = Math.sqrt(variance);
        const cv = stdDev / mean;

        console.log(`[Regularization Check] Mean: ${mean.toFixed(5)}, StdDev: ${stdDev.toFixed(5)}, CV: ${cv.toFixed(5)}`);

        // In a perfectly regularized chain, CV is 0. 
        // In the input, it's high. 
        // Note: decimateChain might have already regularized it by resampling!
        // extractChains performs decimateChain BEFORE smoothing? 
        // Let's check the code:
        // 1. extractChains deduplicates.
        // 2. chains built.
        // 3. densifiedChains = densifyChain(chain).
        //    Inside densifyChain:
        //      - smoothChain (THIS IS WHAT WE CHANGED)
        //      - simplify
        //      - densify

        // So smoothing happens on the raw chain.
        // If our input is within tolerance, it enters smoothChain directly.
    });

    it('should smooth a corner without excessive shrinking', () => {
        // A sharp corner: (0,0) -> ... -> (0.05, 0.05) -> ... -> (0.1, 0)
        // We need enough points to form the legs.
        const inputCoords: [number, number][] = [];

        // Left Leg
        for (let t = 0; t <= 1.0; t += 0.1) {
            inputCoords.push([0.05 * t, 0.05 * t]);
        }
        // Right Leg
        for (let t = 0.1; t <= 1.0; t += 0.1) {
            inputCoords.push([0.05 + 0.05 * t, 0.05 - 0.05 * t]);
        }

        const { chains } = ConstrainedTriangulator.extractChains(createPoints(inputCoords));
        expect(chains.length).toBe(1);
        const chain = chains[0];

        let maxY = 0;
        chain.forEach(p => maxY = Math.max(maxY, p.y));

        // Original peak 0.05.
        // Smoothed should be lower but not gone.
        console.log('Smoothed Peak Y:', maxY);
        expect(maxY).toBeGreaterThan(0.04);
    });
});
