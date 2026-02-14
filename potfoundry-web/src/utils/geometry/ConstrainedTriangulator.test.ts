
import { describe, it, expect } from 'vitest';
import { ConstrainedTriangulator } from './ConstrainedTriangulator';

describe('ConstrainedTriangulator', () => {
    it('should generate corner buffer points for sharp turns', () => {
        // V-shape with sharp turn
        // Points must be within MAX_CONNECT_DIST (0.08) to chain
        // We use 0.05 spacing
        // MUST HAVE >= 4 points to bypass noise filter!
        const features = [
            { x: 0.50, y: 0.50, type: 0, theta: 0.50, t: 0.50, strength: 1 },
            { x: 0.55, y: 0.55, type: 0, theta: 0.55, t: 0.55, strength: 1 }, // Sharp turn
            { x: 0.50, y: 0.60, type: 0, theta: 0.50, t: 0.60, strength: 1 },
            { x: 0.45, y: 0.65, type: 0, theta: 0.45, t: 0.65, strength: 1 }  // Extension to hit 4 points
        ];

        const result = ConstrainedTriangulator.extractChains(features, 1, 1);

        // We expect at least one corner buffer point
        const cornerPoints = result.curveBufferPoints;

        expect(cornerPoints.length).toBeGreaterThan(0);

        // Verify points are "inside" the V (bisector logic)
        // P1->P2->P3 is the sharp turn.
        // P3 is (0.50, 0.60).
        // Bisector check (same as before)
        // Vector 1 (P2->P1): (-0.05, -0.05)
        // Vector 2 (P2->P3): (-0.05, +0.05)
        // Bisector sum: (-0.1, 0) -> Points LEFT (Negative X)
        // So x should be < 0.55
        const p = cornerPoints[0];
        // Note: multiple points may be generated now. We check if ANY satisfy the condition or just the first.
        // The first one likely corresponds to the first sharp turn found.
        expect(p.x).toBeLessThan(0.55);
    });

    it('should generate parallel buffer points for straight segments', () => {
        // Straight line, EXTREEEMELY dense to force chain
        // t stepping by 0.01. normalizeFeatures maps t->y directly.  
        // dist will be 0.01. max is 0.08. 
        const features = [
            { x: 0, y: 0, type: 0, theta: Math.PI, t: 0.10, strength: 1 },
            { x: 0, y: 0, type: 0, theta: Math.PI, t: 0.11, strength: 1 },
            { x: 0, y: 0, type: 0, theta: Math.PI, t: 0.12, strength: 1 },
            { x: 0, y: 0, type: 0, theta: Math.PI, t: 0.13, strength: 1 }
        ];

        const result = ConstrainedTriangulator.extractChains(features, 1, 1);

        // Should have parallel points
        const bufferPoints = result.curveBufferPoints;
        expect(bufferPoints.length).toBeGreaterThan(0);

        // Check offset logic: points should be at x = 0.5 ± 0.004
        // We accept some float tolerance
        // Note: some points from "start/end" caps might be different? 
        // Logic iterates segments.
        const hasLeft = bufferPoints.some(p => Math.abs(p.x - (0.5 - 0.004)) < 0.001);
        const hasRight = bufferPoints.some(p => Math.abs(p.x - (0.5 + 0.004)) < 0.001);

        expect(hasLeft).toBe(true);
        expect(hasRight).toBe(true);
    });
});
