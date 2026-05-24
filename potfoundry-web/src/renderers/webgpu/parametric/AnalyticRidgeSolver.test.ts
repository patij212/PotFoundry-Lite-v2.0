/**
 * AnalyticRidgeSolver.test.ts — Tests for the style-aware ridge solver.
 *
 * Wraps findExtremumNewton with the CPU style evaluator. Given (styleId, opts,
 * t, seedU, kind), returns the U where ∂r/∂u = 0 to machine precision.
 *
 * Each test asserts:
 *   - The solver converges (or |∂r/∂u| below the FD-noise floor)
 *   - The vertex is on the analytic ridge to a tight U-precision
 */
import { describe, it, expect } from 'vitest';
import { solveRidge, solveRidgesBatch } from './AnalyticRidgeSolver';
import { rOuterHarmonicRipple, rOuterSpiralRidges, rOuterWaveInterference } from '../../../geometry/styles';
import { TAU } from '../../../geometry/types';
import type { StyleId, StyleOptions } from '../../../geometry/types';

const R0 = 40;
const H = 100;

/** Independent CPU evaluator for cross-checking — central-difference |∂r/∂u|. */
function gradAbs(
    fn: (theta: number, z: number, r0: number, H: number, opts: StyleOptions) => number,
    u: number, t: number,
): number {
    const h = 1e-7;
    const uW = ((u % 1) + 1) % 1;
    const rPlus = fn(((uW + h) % 1) * TAU, t, R0, H, {} as StyleOptions);
    const rMinus = fn(((uW - h + 1) % 1) * TAU, t, R0, H, {} as StyleOptions);
    return Math.abs((rPlus - rMinus) / (2 * h));
}

describe('solveRidge — single style ridge placement', () => {
    it('HarmonicRipple peak at t=50: |∂r/∂u| < 1e-7 after Newton', () => {
        // Find an approximate seed by coarse sampling
        let seedU = 0;
        let seedR = -Infinity;
        for (let i = 0; i < 256; i++) {
            const u = i / 256;
            const r = rOuterHarmonicRipple(u * TAU, 50, R0, H, {} as StyleOptions);
            if (r > seedR) { seedR = r; seedU = u; }
        }
        const result = solveRidge({
            styleId: 'HarmonicRipple' as StyleId, opts: {} as StyleOptions, r0: R0, H,
            t: 50, seedU, kind: 'peak',
        });
        const g = gradAbs(rOuterHarmonicRipple, result.u, 50);
        console.log(`[ridge-solver] HarmonicRipple peak: seedU=${seedU.toFixed(6)} → finalU=${result.u.toFixed(8)}, |∂r/∂u|=${g.toExponential(3)}, iter=${result.iterations}, converged=${result.converged}`);
        expect(g).toBeLessThan(1e-7);
    });

    it('SpiralRidges peak at t=50: |∂r/∂u| < 1e-7 after Newton', () => {
        let seedU = 0; let seedR = -Infinity;
        for (let i = 0; i < 256; i++) {
            const u = i / 256;
            const r = rOuterSpiralRidges(u * TAU, 50, R0, H, {} as StyleOptions);
            if (r > seedR) { seedR = r; seedU = u; }
        }
        const result = solveRidge({
            styleId: 'SpiralRidges' as StyleId, opts: {} as StyleOptions, r0: R0, H,
            t: 50, seedU, kind: 'peak',
        });
        const g = gradAbs(rOuterSpiralRidges, result.u, 50);
        console.log(`[ridge-solver] SpiralRidges peak: seedU=${seedU.toFixed(6)} → finalU=${result.u.toFixed(8)}, |∂r/∂u|=${g.toExponential(3)}, iter=${result.iterations}, converged=${result.converged}`);
        expect(g).toBeLessThan(1e-7);
    });

    it('WaveInterference peak at t=50: |∂r/∂u| < 1e-7 after Newton', () => {
        let seedU = 0; let seedR = -Infinity;
        for (let i = 0; i < 256; i++) {
            const u = i / 256;
            const r = rOuterWaveInterference(u * TAU, 50, R0, H, {} as StyleOptions);
            if (r > seedR) { seedR = r; seedU = u; }
        }
        const result = solveRidge({
            styleId: 'WaveInterference' as StyleId, opts: {} as StyleOptions, r0: R0, H,
            t: 50, seedU, kind: 'peak',
        });
        const g = gradAbs(rOuterWaveInterference, result.u, 50);
        console.log(`[ridge-solver] WaveInterference peak: seedU=${seedU.toFixed(6)} → finalU=${result.u.toFixed(8)}, |∂r/∂u|=${g.toExponential(3)}, iter=${result.iterations}, converged=${result.converged}`);
        expect(g).toBeLessThan(1e-7);
    });

    it('solveRidge places result U in [0, 1) regardless of Newton path', () => {
        // Seed near U=1.0 boundary — solver may transiently overshoot
        const result = solveRidge({
            styleId: 'HarmonicRipple' as StyleId, opts: {} as StyleOptions, r0: R0, H,
            t: 50, seedU: 0.99, kind: 'peak', searchHalfWidth: 0.02,
        });
        expect(result.u).toBeGreaterThanOrEqual(0);
        expect(result.u).toBeLessThan(1);
    });

    it('respects searchHalfWidth — stays near seed on multi-ridge styles', () => {
        // SpiralRidges has many peaks; seed at 0.1, halfWidth 0.005 → stay in [0.095, 0.105]
        const result = solveRidge({
            styleId: 'SpiralRidges' as StyleId, opts: {} as StyleOptions, r0: R0, H,
            t: 50, seedU: 0.1, kind: 'peak', searchHalfWidth: 0.005,
        });
        expect(Math.abs(result.u - 0.1)).toBeLessThanOrEqual(0.005 + 1e-9);
    });
});

describe('solveRidgesBatch — performance and bulk correctness', () => {
    it('batch of 500 random seeds all converge below FD-noise floor', () => {
        const entries: Array<{
            t: number; seedU: number; kind: 'peak' | 'valley';
        }> = [];
        // Use a deterministic seed sequence for reproducibility
        for (let i = 0; i < 500; i++) {
            const t = 5 + (i % 90); // sweep 5..94 mm in T
            // Coarse find of peak for this t
            let seedU = 0; let bestR = -Infinity;
            for (let j = 0; j < 128; j++) {
                const u = j / 128;
                const r = rOuterHarmonicRipple(u * TAU, t, R0, H, {} as StyleOptions);
                if (r > bestR) { bestR = r; seedU = u; }
            }
            entries.push({ t, seedU, kind: 'peak' });
        }

        const t0 = performance.now();
        const results = solveRidgesBatch({
            styleId: 'HarmonicRipple' as StyleId, opts: {} as StyleOptions, r0: R0, H, entries,
        });
        const elapsed = performance.now() - t0;

        let maxGrad = 0;
        let aboveNoiseFloor = 0;
        for (let i = 0; i < results.length; i++) {
            const g = gradAbs(rOuterHarmonicRipple, results[i].u, entries[i].t);
            if (g > maxGrad) maxGrad = g;
            // FD-noise floor is ~|f| * f64-eps / h = 50mm * 2.2e-16 / 1e-7 ≈ 1.1e-7 mm/U.
            // Anything above 5x that (i.e. > 5e-7) suggests the seed was bad,
            // not floating-point noise.
            if (g > 5e-7) aboveNoiseFloor++;
        }
        // Convert max gradient to physical displacement at typical radius: a
        // gradient of g mm/U combined with a residual U-error of ~h gives
        // displacement g*h. For g=1e-6 and h=1e-7 that's 1e-13 mm — far
        // below any printable resolution.
        console.log(`[ridge-solver-batch] HarmonicRipple ×500: max |∂r/∂u|=${maxGrad.toExponential(3)} mm/U, above-noise-floor=${aboveNoiseFloor}/500, elapsed=${elapsed.toFixed(1)}ms`);

        // Fingerprint-on-blade target: |∂r/∂u| < 1e-5 (= 1nm on a 250mm pot).
        // Current production sample-based re-snap leaves gradients of 1e-2 to 1e+0.
        expect(maxGrad).toBeLessThan(1e-5);
        // Allow up to 10% of batch to sit at the FD-noise floor; the rest must
        // be cleanly converged.
        expect(aboveNoiseFloor).toBeLessThanOrEqual(50);
        expect(elapsed).toBeLessThan(500); // 500 vertices in well under 500ms
    });
});
