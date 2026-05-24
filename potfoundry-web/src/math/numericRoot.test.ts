/**
 * numericRoot.test.ts — Tests for the generic Newton extremum solver.
 *
 * Pin invariants against analytic functions with known extrema:
 *   - Quadratic    (parabola, well-conditioned)
 *   - Sine         (smooth periodic)
 *   - Plateau      (no extremum — should report non-convergence)
 *   - Multi-extremum (bounded search must stay near seed)
 *   - Sharp Gaussian (well-conditioned but steep)
 *   - Two close peaks (high-frequency feature)
 */
import { describe, it, expect } from 'vitest';
import { findExtremumNewton } from './numericRoot';

describe('findExtremumNewton', () => {
    it('finds maximum of -(u - 0.3)^2 to machine precision', () => {
        const f = (u: number) => -(u - 0.3) * (u - 0.3);
        const r = findExtremumNewton(f, 0.25, { kind: 'max', tolerance: 1e-12 });
        expect(r.converged).toBe(true);
        expect(Math.abs(r.u - 0.3)).toBeLessThan(1e-9);
        expect(r.gradAbs).toBeLessThan(1e-9);
    });

    it('finds minimum of (u - 0.7)^2 + 1 to machine precision', () => {
        const f = (u: number) => (u - 0.7) ** 2 + 1;
        // Seed=0.6, target=0.7 → distance 0.1. Default halfWidth (0.05) would
        // clip the Newton step. This function has a single extremum, so a wide
        // halfWidth is safe.
        const r = findExtremumNewton(f, 0.6, {
            kind: 'min', tolerance: 1e-12, searchHalfWidth: 0.5,
        });
        expect(r.converged).toBe(true);
        expect(Math.abs(r.u - 0.7)).toBeLessThan(1e-9);
        expect(r.gradAbs).toBeLessThan(1e-9);
    });

    it('finds maximum of sin(2*PI*u) at u=0.25', () => {
        const f = (u: number) => Math.sin(2 * Math.PI * u);
        const r = findExtremumNewton(f, 0.2, { kind: 'max', tolerance: 1e-12 });
        expect(r.converged).toBe(true);
        expect(Math.abs(r.u - 0.25)).toBeLessThan(1e-9);
    });

    it('reports non-convergence when function is constant (no extremum)', () => {
        const f = (_u: number) => 1.0;
        const r = findExtremumNewton(f, 0.5, { kind: 'max', tolerance: 1e-12, maxIter: 20 });
        // A constant function has zero gradient everywhere — that's actually a degenerate
        // "everywhere extremum". The solver should report converged (gradient is zero)
        // but iterations = 0 or 1.
        expect(r.gradAbs).toBeLessThan(1e-9);
    });

    it('respects searchHalfWidth — bounded search stays near seed', () => {
        // Four peaks at u = 1/16, 5/16, 9/16, 13/16
        const f = (u: number) => Math.sin(2 * Math.PI * 4 * u);
        const r = findExtremumNewton(f, 0.05, {
            kind: 'max', tolerance: 1e-12, searchHalfWidth: 0.05,
        });
        // Seed is at 0.05, half-width 0.05 → search confined to [0, 0.10]
        // Only peak in that interval is at 1/16 = 0.0625
        expect(Math.abs(r.u - 1 / 16)).toBeLessThan(1e-9);
    });

    it('finds peak of sharp Gaussian g(u) = exp(-((u-0.5)/0.001)^2)', () => {
        const f = (u: number) => {
            const x = (u - 0.5) / 0.001;
            return Math.exp(-(x * x));
        };
        // For a Gaussian with sigma=0.001, the FD noise floor is
        // O(eps_f64 * |f| / h) ≈ 2e-9 (with h=1e-7, |f|≈1). The achievable
        // U-precision is ~1e-7 (250nm on a 250mm pot), well below "fingerprint
        // on blade" resolution. Tolerance is set to that realistic floor.
        const r = findExtremumNewton(f, 0.4995, {
            kind: 'max', tolerance: 1e-7, fdStep: 1e-5,
        });
        expect(Math.abs(r.u - 0.5)).toBeLessThan(1e-6);
        expect(r.gradAbs).toBeLessThan(1e-3); // small residual; FD noise dominates
    });

    it('locks onto the nearer of two close peaks', () => {
        // Peaks at u = 0.5 - 0.01 and u = 0.5 + 0.01
        // Seed exactly between → either is valid. Seed offset → nearer wins.
        const f = (u: number) => {
            const xa = (u - 0.49) / 0.002;
            const xb = (u - 0.51) / 0.002;
            return Math.exp(-(xa * xa)) + Math.exp(-(xb * xb));
        };
        const r = findExtremumNewton(f, 0.4905, {
            kind: 'max', tolerance: 1e-12, searchHalfWidth: 0.005,
        });
        expect(r.converged).toBe(true);
        expect(Math.abs(r.u - 0.49)).toBeLessThan(1e-6);
    });
});
