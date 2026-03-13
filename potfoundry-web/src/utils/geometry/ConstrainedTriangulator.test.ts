
import { describe, it, expect } from 'vitest';
import { ConstrainedTriangulator } from './ConstrainedTriangulator';

describe('ConstrainedTriangulator', () => {
    it('should generate corner buffer points for sharp turns', () => {
        // V-shape with sharp turn.
        // normalizeFeatures maps theta to x = theta/(2*PI), t to y directly.
        // Points must be within MAX_CONNECT_DIST (0.05) after normalization.
        // Use theta values that produce ~0.01 spacing in x after normalization.
        // theta spacing of 0.06 → x spacing = 0.06/(2*PI) ≈ 0.0095
        // t spacing of 0.02 → y spacing = 0.02
        // dist ≈ sqrt(0.0095² + 0.02²) ≈ 0.022 << 0.05 ✓
        const features = [
            { x: 0, y: 0, type: 0, theta: 3.14, t: 0.50, strength: 1 },
            { x: 0, y: 0, type: 0, theta: 3.20, t: 0.52, strength: 1 }, // Sharp turn
            { x: 0, y: 0, type: 0, theta: 3.14, t: 0.54, strength: 1 },
            { x: 0, y: 0, type: 0, theta: 3.08, t: 0.56, strength: 1 }  // Continuation
        ];

        const result = ConstrainedTriangulator.extractChains(features, 1, 1);

        // We expect at least one corner buffer point
        const cornerPoints = result.curveBufferPoints;
        expect(cornerPoints.length).toBeGreaterThan(0);
    });

    it('should generate parallel buffer points for straight segments', () => {
        // Straight vertical line: theta=PI (normalized x=0.5), t varies by 0.01.
        // normalizeFeatures: x = theta/(2*PI) = 0.5, y = t directly.
        // dist between consecutive: 0.01 < MAX_CONNECT_DIST(0.05) ✓
        const features = [
            { x: 0, y: 0, type: 0, theta: Math.PI, t: 0.10, strength: 1 },
            { x: 0, y: 0, type: 0, theta: Math.PI, t: 0.11, strength: 1 },
            { x: 0, y: 0, type: 0, theta: Math.PI, t: 0.12, strength: 1 },
            { x: 0, y: 0, type: 0, theta: Math.PI, t: 0.13, strength: 1 }
        ];

        const result = ConstrainedTriangulator.extractChains(features, 1, 1);

        // Should have parallel buffer points
        const bufferPoints = result.curveBufferPoints;
        expect(bufferPoints.length).toBeGreaterThan(0);

        // Parallel offset is PARALLEL_OFFSET_WIDE = 0.002.
        // For a vertical chain (pure Y direction), the perpendicular is along X.
        // Buffer points should be at x = 0.5 ± 0.002 (±tolerance for densification jitter)
        const hasLeft = bufferPoints.some(p => Math.abs(p.x - (0.5 - 0.002)) < 0.001);
        const hasRight = bufferPoints.some(p => Math.abs(p.x - (0.5 + 0.002)) < 0.001);

        expect(hasLeft).toBe(true);
        expect(hasRight).toBe(true);
    });
});
