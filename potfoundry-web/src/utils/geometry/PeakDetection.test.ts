
import { describe, it, expect } from 'vitest';

/**
 * Math Logic Prototype for WGSL implementation
 * Finds the peak of a parabola passing through (-1, L), (0, C), (1, R).
 * Formula derived: x_peak = (L - R) / (2 * (L - 2*C + R))
 */
function calculatePeakOffset(L: number, C: number, R: number): number {
    const numerator = L - R;
    const denominator = 2 * (L - 2 * C + R);

    // Avoid divide by zero
    if (Math.abs(denominator) < 1e-9) return 0;

    return numerator / denominator;
}

describe('Sub-Pixel Peak Detection (Math Verification)', () => {
    it('should return 0 offset for symmetric neighbors', () => {
        // Parabola centered at 0: y = -x^2 + 1
        // L(-1) = 0, C(0) = 1, R(1) = 0
        const delta = calculatePeakOffset(0, 1, 0);
        expect(delta).toBeCloseTo(0);
    });

    it('should detect positive offset (Peak shifted right)', () => {
        // Parabola centered at 0.2: y = -(x - 0.2)^2 + 1
        // L(-1) = -(-1.2)^2 + 1 = -0.44
        // C(0)  = -(-0.2)^2 + 1 = 0.96
        // R(1)  = -(0.8)^2 + 1  = 0.36
        const delta = calculatePeakOffset(-0.44, 0.96, 0.36);
        expect(delta).toBeCloseTo(0.2);
    });

    it('should detect negative offset (Peak shifted left)', () => {
        // Parabola centered at -0.3: y = -(x + 0.3)^2 + 1
        // L(-1) = -(-0.7)^2 + 1 = 0.51
        // C(0)  = -(0.3)^2 + 1  = 0.91
        // R(1)  = -(1.3)^2 + 1  = -0.69
        const delta = calculatePeakOffset(0.51, 0.91, -0.69);
        expect(delta).toBeCloseTo(-0.3);
    });

    it('should handle small curvature differences', () => {
        // Flatter parabola
        // y = -0.1*x^2 + 1
        // L = 0.9, C = 1.0, R = 0.9
        const delta = calculatePeakOffset(0.9, 1.0, 0.9);
        expect(delta).toBeCloseTo(0);
    });

    it('should be robust to exact linear case (degenerate)', () => {
        // Linear: y = x
        // L = -1, C = 0, R = 1
        // Denom = 2(-1 - 0 + 1) = 0
        const delta = calculatePeakOffset(-1, 0, 1);
        expect(delta).toBe(0);
    });
});
